const express = require('express');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const winston = require('winston');
const speakeasy = require('speakeasy');
const bcrypt = require("bcrypt");

require('dotenv').config();

// Verifica que JWT_SECRET esté disponible
const JWT_SECRET = process.env.JWT_SECRET || 'uteq';

const PORT = process.env.PORT || 3002; 


//const serviceAccount = require("./config/firestore.json");
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    // otros campos necesarios...
  };

// Inicializa Firebase solo si no ha sido inicializado previamente
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
} else {
    admin.app();
}

// Importar rutas correctamente
const routes = require("./routes");

const server = express();



// Middlewares
server.use(
    cors({
        origin: 'http://localhost:3000',
        credentials: true,
    })
);



// Winston para logs
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/all.log', level: 'info' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

server.use(bodyParser.json());
const db = admin.firestore();

// Middleware para registrar logs
server.use((req, res, next) => {
    console.log(` [${req.method}] ${req.url} - Body:`, req.body);
    const startTime = Date.now();
    const originalSend = res.send;
    let statusCode;

    res.send = function (body) {
        statusCode = res.statusCode;
        originalSend.call(this, body);
    };

    res.on('finish', async () => {
        const logLevel = statusCode >= 400 ? 'error' : 'info';
        const responseTime = Date.now() - startTime;
        const logData = {
            logLevel: statusCode >= 400 ? 'error' : 'info',
            timestamp: admin.firestore.FieldValue.serverTimestamp(), // Usar timestamp del servidor
            method: req.method,
            url: req.url,
            path: req.path,
            query: req.query,
            params: req.params,
            status: statusCode || res.statusCode,
            server: 'server2', // Identificador del servidor
            responseTime: responseTime,
            ip: req.ip || req.connection.remoteAddress, 
            userAgent: req.get('User-Agent'),
            protocol: req.protocol,
            hostname: req.hostname,
            system: {
                nodeVersion: process.version,
                environment: process.env.NODE_ENV || 'development',
                pid: process.pid
            },
        };

        logger.log({
            level: logLevel,
            message: 'Request completed',
            ...logData
        });

        logger.info(logData);

        // Guardar en Firestore
        try {
            await db.collection('logs2').add(logData);
            console.log(" Log guardado en Firebase:", logData);
        } catch (error) {
            logger.error('Error al guardar log en Firestore:', error);
        }
    });

    next();
});

// Usar las rutas de "routes.js"
server.use("/api", routes);

server.get('/', (req, res) => {
    res.send(`Servidor corriendo en el puerto ${PORT}`);
  });
  

// Levantar servidor
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});