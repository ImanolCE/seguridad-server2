const express = require('express');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const winston = require('winston');
const speakeasy = require('speakeasy');
const bcrypt = require("bcrypt");

require('dotenv').config();

const server = express();

const corsOptions = {
    origin: ['https://logs-frontend-2.onrender.com', 'http://localhost:3000'],
    credentials: true, // Habilita credenciales
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 200
  };
  
  // Remueve los headers manuales y usa solo:
  server.use(cors(corsOptions));
  server.options('*', cors(corsOptions)); // Esto es crucial para preflight
  server.use(bodyParser.json());


  server.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://logs-frontend-2.onrender.com');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });

// Verifica que JWT_SECRET esté disponible
const JWT_SECRET = process.env.JWT_SECRET || 'uteq';

const PORT = process.env.PORT || 3002; 


//const serviceAccount = require("./config/firestore.json");
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
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
            server: 'server1', // Identificador del servidor
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

server.get('/test', (req, res) => {
    res.json({ message: "El servidor funciona!" });
  });

server.get('/', (req, res) => {
    res.send(`Servidor corriendo en el puerto ${PORT}`);
  });
  

// Levantar servidor
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
