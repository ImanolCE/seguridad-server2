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

const PORT = process.env.PORT || 3001; 

// para limitar las peticiones que llegan
const ratelimit = require('express-rate-limit');
const limiter = ratelimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP 100 request per windows
    message : 'Too many request from this IP, please try again after an hour'
});


const serviceAccount = require("./config/firestore.json");
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

// Aplicar el limitador a todas las rutas
server.use(limiter);

// Middlewares
server.use(
    cors({
        origin: 'http://localhost:3000',
        credentials: true,
    })
);

server.use(limiter);

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
            logLevel: logLevel,
            timestamp: new Date(),
            method: req.method,
            url: req.url,
            path: req.path,
            query: req.query,
            params: req.params,
            status: statusCode || res.statusCode,
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
            await db.collection('logs').add(logData);
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
