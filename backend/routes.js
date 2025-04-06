const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const speakeasy = require('speakeasy');

const router = express.Router();
const db = admin.firestore();
const JWT_SECRET = process.env.JWT_SECRET || 'uteq';

console.debug('Using JWT secret: ' + JWT_SECRET);

// para registrar 2 en Firestore
const logEvent = async (eventType, email, status, message, logData) => {
    try {
        await db.collection('logs2').add({
            eventType,
            email,
            status,
            message,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            logLevel: status >= 400 ? 'error' : 'info', // Automático basado en status
            responseTime: 0, // Ajustar según necesidad
            server: 'server2', // Definir según servidor
            method: 'POST' // O el método correspondiente
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
        
        // Validación robusta
        if (!email?.match(/^\S+@\S+\.\S+$/)) {
            return res.status(400).json({ 
                success: false,
                message: "Formato de email inválido"
            });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "La contraseña debe tener al menos 6 caracteres"
            });
        }

        const userRef = db.collection('usuarios').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            await logEvent('login', email, 401, 'Usuario no encontrado');
            return res.status(401).json({
                success: false,
                message: "Credenciales inválidas"
            });
        }

        const user = doc.data();
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            await logEvent('login', email, 401, 'Contraseña incorrecta');
            return res.status(401).json({
                success: false,
                message: "Credenciales inválidas"
            });
        }

        const token = jwt.sign(
            { 
                email: user.email,
                username: user.username 
            }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        await logEvent('login', email, 200, 'Inicio de sesión exitoso');
        
        // En el endpoint /login:
        res.setHeader('Access-Control-Allow-Origin', 'https://logs-frontend-2.onrender.com');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.json({
        success: true,
        message: "Autenticación exitosa",
        token: token,
        requiresMFA: true
        });

    } catch (error) {
        console.error("Error en login:", error);
        await logEvent('login', req.body.email, 500, 'Error interno');
        res.status(500).json({
            success: false,
            message: "Error en el servidor"
        });
    }
});
// registro de suauario
router.post('/register', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Validación mejorada
        if (!email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: "Todos los campos son requeridos"
            });
        }

        // Verificar si el usuario ya existe
        const userExists = await db.collection('usuarios').doc(email).get();
        if (userExists.exists) {
            return res.status(409).json({
                success: false,
                message: "El usuario ya existe"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const secret = speakeasy.generateSecret({ length: 20 });

        await db.collection("usuarios").doc(email).set({
            email,
            username,
            password: hashedPassword,
            mfaSecret: secret.base32,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await logEvent('register', email, 201, 'Registro exitoso');
        
        res.status(201).json({
            success: true,
            message: "Usuario registrado",
            secret: secret.otpauth_url
        });

    } catch (error) {
        console.error("Error en registro:", error);
        await logEvent('register', req.body.email, 500, 'Error en registro');
        res.status(500).json({
            success: false,
            message: "Error al registrar usuario"
        });
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
