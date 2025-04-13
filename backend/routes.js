const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const speakeasy = require('speakeasy');
const crypto = require('crypto');

const router = express.Router();
const db = admin.firestore();
const JWT_SECRET = process.env.JWT_SECRET || 'uteq';

console.debug('Using JWT secret: ' + JWT_SECRET);


// para registrar logs en Firestore
const logEvent = async (eventType, email, status, message, logData) => {
    try {
        await db.collection('logs').add({
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
            }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        res.json({
            success: true,
            message: "Autenticación exitosa",
            token: token,
            requiresMFA: true
            });

        await logEvent('login', email, 200, 'Inicio de sesión exitoso');
        
        // En el endpoint /login:
        'Access-Control-Allow-Origin', 'https://logs-frontend-2.onrender.com'
        'Access-Control-Allow-Credentials', 'true'


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

        'Access-Control-Allow-Origin', 'https://logs-frontend-2.onrender.com'
        'Access-Control-Allow-Credentials', 'true'

        if (verified) {
            await logEvent('verify-otp', email, 'success', 'OTP verificado');
            return res.json({ 
                success: true, 
                message: "Autenticado correctamente" 
            });
        } else {
            await logEvent('verify-otp', email, 'failed', 'Código OTP incorrecto');
            return res.status(401).json({ 
                success: false, 
                message: "Código OTP incorrecto" 
            });
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

// Generar token de recuperación
const generateRecoveryToken = () => {
    return crypto.randomBytes(20).toString('hex');
};

// Endpoint para solicitar recuperación de contraseña
/* router.post('/request-password-reset', async (req, res) => {
    try {
        const { email } = req.body;

        // Validar email
        if (!email?.match(/^\S+@\S+\.\S+$/)) {
            return res.status(400).json({ 
                success: false,
                message: "Formato de email inválido"
            });
        }

        // Verificar si el usuario existe
        const userRef = db.collection('usuarios').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            await logEvent('password-reset', email, 404, 'Usuario no encontrado');
            return res.status(404).json({
                success: false,
                message: "No existe una cuenta con este correo"
            });
        }

        // Generar token de recuperación (simulado)
        const recoveryToken = generateRecoveryToken();
        
        // En una implementación real, aquí enviarías un correo con el token
        console.log(`Token de recuperación para ${email}: ${recoveryToken}`);
        
        await logEvent('password-reset', email, 200, 'Solicitud de recuperación enviada');
        
        res.json({
            success: true,
            message: "Se ha enviado un correo con instrucciones",
            // En producción no enviarías el token en la respuesta
            recoveryToken: recoveryToken 
        });

    } catch (error) {
        console.error("Error en solicitud de recuperación:", error);
        await logEvent('password-reset', req.body.email, 500, 'Error interno');
        res.status(500).json({
            success: false,
            message: "Error en el servidor"
        });
    }
});
 */


// Endpoint para verificar OTP de recuperación
router.post('/verify-recovery-otp', async (req, res) => {
    try {
        const { email, token } = req.body;

        // Buscar el usuario
        const userSnapshot = await db.collection("usuarios").doc(email).get();
        
        if (!userSnapshot.exists) {
            await logEvent('verify-recovery-otp', email, 404, 'Usuario no encontrado');
            return res.status(404).json({ 
                success: false, 
                message: "Usuario no encontrado" 
            });
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
            // Generar token de recuperación
            const recoveryToken = generateRecoveryToken();
            
            await logEvent('verify-recovery-otp', email, 200, 'OTP de recuperación verificado');
            
            return res.json({ 
                success: true, 
                message: "Código verificado",
                recoveryToken: recoveryToken
            });
        } else {
            await logEvent('verify-recovery-otp', email, 401, 'Código OTP incorrecto');
            return res.status(401).json({ 
                success: false, 
                message: "Código OTP incorrecto" 
            });
        }
    } catch (error) {
        console.error("Error verificando OTP de recuperación:", error);
        await logEvent('verify-recovery-otp', req.body.email, 500, 'Error interno');
        return res.status(500).json({ 
            success: false, 
            message: "Error interno del servidor" 
        });
    }
});

// Endpoint para actualizar contraseña
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword, recoveryToken, otpToken } = req.body;

        // Validaciones básicas
        if (!email || !newPassword || !recoveryToken || !otpToken) {
            return res.status(400).json({
                success: false,
                message: "Datos incompletos"
            });
        }

        // Buscar el usuario
        const userRef = db.collection('usuarios').doc(email);
        const doc = await userRef.get();

        if (!doc.exists) {
            await logEvent('reset-password', email, 404, 'Usuario no encontrado');
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
        }

        // Verificar OTP nuevamente por seguridad
        const usuario = doc.data();
        const verified = speakeasy.totp.verify({
            secret: usuario.mfaSecret,
            encoding: 'base32',
            token: otpToken,
            window: 1
        });

        if (!verified) {
            await logEvent('reset-password', email, 401, 'OTP inválido');
            return res.status(401).json({
                success: false,
                message: "Código de verificación inválido"
            });
        }

        // Hash de la nueva contraseña
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Actualizar contraseña
        await userRef.update({
            password: hashedPassword,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await logEvent('reset-password', email, 200, 'Contraseña actualizada');
        
        res.json({
            success: true,
            message: "Contraseña actualizada correctamente"
        });

    } catch (error) {
        console.error("Error al actualizar contraseña:", error);
        await logEvent('reset-password', req.body.email, 500, 'Error interno');
        res.status(500).json({
            success: false,
            message: "Error al actualizar contraseña"
        });
    }
});

module.exports = router;