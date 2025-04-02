import React, { useState, useEffect } from "react";
import { Bar } from "react-chartjs-2";
import axios from "axios";
import { Chart as ChartJS } from 'chart.js/auto';

const Logs = () => {
    const [logsData, setLogsData] = useState({
        server1: { info: 0, warning: 0, error: 0 },
        server2: { info: 0, warning: 0, error: 0 },
    });

    useEffect(() => {
        // Fetch the logs data from the server
        const fetchLogsData = async () => {
            try {
                const res = await axios.get("http://localhost:3001/api/logs");
                setLogsData(res.data);
            } catch (error) {
                console.error("Error al obtener los logs", error);
            }
        };

        fetchLogsData();
    }, []);

    const data = {
        labels: ['Info', 'Warning', 'Error'],
        datasets: [
            {
                label: 'Servidor 1 (Rate Limit)',
                data: [logsData.server1.info, logsData.server1.warning, logsData.server1.error],
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
            },
            {
                label: 'Servidor 2 (Sin Rate Limit)',
                data: [logsData.server2.info, logsData.server2.warning, logsData.server2.error],
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
            },
        ],
    };

    return (
        <div className="logs-container">
            <h1>Logs</h1>
            <p>Este gráfico muestra los diferentes niveles de logs en los servidores.</p>
            <Bar data={data} />
        </div>
    );
};

export default Logs;
