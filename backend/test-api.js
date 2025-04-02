// Importamos axios para realizar peticiones HTTP
const axios = require('axios');

// Definimos la URL base de la API
const API_BASE_URL = 'http://localhost:3001/api';

// Número total de peticiones que se enviarán
const TOTAL_REQUESTS = 1000; 

// Contadores para respuestas exitosas y con error
let successCount = 0;
let errorCount = 0;

// Función para enviar una petición a un endpoint específico
const sendRequest = async (endpoint) => {
    try {
        // Realiza la petición GET al endpoint seleccionado
        const response = await axios.get(`${API_BASE_URL}/${endpoint}`);
        console.log(` ${endpoint} - Status: ${response.status}`); // Si es exitosa, imprime el status
        successCount++; // Suma al contador de éxito
    } catch (error) {
        // Si hay un error (respuesta de estado 400 o fallo en la conexión)
        console.log(` ${endpoint} - Status: ${error.response?.status || 'Unknown error'}`);
        errorCount++; // Suma al contador de errores
    }
};

// Función para ejecutar el test de carga
const runTest = async () => {
    console.log(` Iniciando prueba con ${TOTAL_REQUESTS} peticiones...`);

    const promises = []; // Array para almacenar las promesas de las peticiones

    for (let i = 0; i < TOTAL_REQUESTS; i++) {
        // Decide aleatoriamente si mandar la petición a /random o /error
        const endpoint = Math.random() > 0.5 ? 'random' : 'error';
        
        // Añade la promesa de la petición al array (sin esperar a que termine)
        promises.push(sendRequest(endpoint));
    }

    // Espera a que todas las promesas (peticiones) terminen
    await Promise.all(promises);

    // Cuando todas las peticiones terminen, muestra el resultado
    console.log(` Test completado`);
    console.log(` Peticiones exitosas: ${successCount}`);
    console.log(` Peticiones con error: ${errorCount}`);
};

// Llama a la función para ejecutar el test
runTest();
