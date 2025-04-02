const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const speakeasy = require('speakeasy');

const router = express.Router();
const db = admin.firestore();
const JWT_SECRET = process.env.JWT_SECRET || 'uteq';

console.debug('Using JWT secret: ' + JWT_SECRET);

// **Registro de usuario**
/* router.post('/register', async (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !password || !username) {
        return res.status(400).json({ message: 'Missing fields' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const secret = speakeasy.generateSecret({ length: 20 });

        await db.collection('users').add({
            email,
            username,
            password: hashedPassword,
            mfasecret: secret.base32
        });

        res.status(201).json({ message: 'User registered', secret: secret.otpauth_url });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
});

// **Login de usuario**
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ statusCode: 400, message: "Campos requeridos" });
    }

    try {
        const userSnapshot = await db.collection('users').where('email', '==', email).get();

        if (userSnapshot.empty) {
            return res.status(401).json({ statusCode: 401, message: "Las credenciales son incorrectas" });
        }

        const user = userSnapshot.docs[0].data();
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ statusCode: 401, message: "Las credenciales son incorrectas" });
        }

        const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login exitoso', token });

    } catch (error) {
        res.status(500).json({ message: 'Error en el login', error: error.message });
    }
}); */



// para registrar logs en Firestore
const logEvent = async (eventType, email, status, message, logData) => {
    try {
            await db.collection('logs').add({
            eventType,
            email,
            status,
            message,
            timestamp: new Date().toISOString()
        });
        console.log("Log guardado correctamente");
    } catch (error) {
        console.error("Error al guardar log en Firestore:", error);
    }
};

//  Endpoint de login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email y contraseña son requeridos" });
        }

        const userSnapshot = await db.collection('usuarios').doc(email).get();
        if (!userSnapshot.exists) {
            await logEvent('login', email, 'failed', 'Contraseña incorrecta');

            return res.status(401).json({ message: "Las credenciales son incorrectas" });
        }

        const user = userSnapshot.data();
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            await logEvent('login', email, 'success', 'Login exitoso');

            return res.status(401).json({ message: "Las credenciales son incorrectas" });
        }

        const token = jwt.sign({ email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
        await logEvent('login', email, 'success', 'Login exitoso');

        res.json({ message: 'Login exitoso', token, username: user.username, requiresMFA: true });
    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// registro de suauario
router.post('/register', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        if (!email || !username || !password) {
            return res.status(400).json({ message: 'Email, usuario y contraseña son requeridos' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const secret = speakeasy.generateSecret({ length: 20 });

        const user = {
            email,
            username,
            password: hashedPassword,
            mfaSecret: secret.base32,
        };
        await db.collection("usuarios").doc(email).set(user);
        await logEvent('register', email, 'success', 'Usuario registrado con éxito');

        res.json({ message: 'Usuario registrado con éxito', secret: secret.otpauth_url });
    } catch (error) {
        console.error("Error al registrar usuario:", error);
        await logEvent('register', email, 'failed', 'Error al registrar usuario');

        res.status(500).json({ message: "Error interno del servidor" });
    }
});

  //modificado 
  router.post('/verify-otp', async (req, res) => {
    try {
        const { email, token } = req.body;
        
        // Buscar el usuario en Firebase Firestore
        const userSnapshot = await db.collection("usuarios").doc(email).get();
        
        if (!userSnapshot.exists) {
            await logEvent('verify-otp', email, 'failed', 'Usuario no encontrado');

            return res.status(404).json({ success: false, message: "Usuario no encontrado" });
        }

        const usuario = userSnapshot.data();

        // Verificar el código OTP
        const verified = speakeasy.totp.verify({
            secret: usuario.mfaSecret, 
            encoding: 'base32',
            token,
            window: 1 
        });

        if (verified) {
            
            await logEvent('verify-otp', email, 'success', 'OTP verificado ');

            return res.json({ success: true, message: "Autenticado correctamente" });
        } else {
            await logEvent('verify-otp', email, 'failed', 'Código OTP incorrecto');

            return res.status(401).json({ success: false, message: "Código OTP incorrecto" });
        }
    } catch (error) {
        console.error("Error verificando OTP:", error);
        await logEvent('verify-otp', email, 'failed', 'Error interno del servidor');

        return res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
});




// Middleware para verificar el token
// Ruta para verificar el token
router.get("/verify-token", (req, res) => {
    const token = req.headers["authorization"];
    if (!token) {
        return res.status(401).json({ message: "No hay token" });
    }

    jwt.verify(token.split(" ")[1], JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Token inválido o expirado" });
        }
        res.json({ message: "Token válido", user: decoded });
    });
});



// **Rutas de prueba de peticiones**
router.get('/random', (req, res) => {
    const status = Math.random() > 0.5 ? 200 : 400;
    if (status === 200) {
        return res.status(200).json({ message: 'Request successful' });
    } else {
        return res.status(400).json({ message: 'Request failed' });
    }
});

router.get('/error', (req, res) => {
    return res.status(400).json({ message: 'Simulated error' });
});


// api get info 

router.get("/getInfo", (req, res) => {
    const info = {
        VersionNode: process.version, 
        alumno: "Imanol Camacho Etsrada", 
        grupo: "IDGS11",
        grado:"8to",
        docente: "Emmanuel Martínez Hernández"
    };
    res.json(info);
});


module.exports = router;
