import React, { useState } from "react";
import axios from "axios";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";


const Login = () => {
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [secretUrl, setSecretUrl] = useState("");
    const [otp, setOtp] = useState("");
    const [step, setStep] = useState("login");

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!username.trim() || !email.trim() || !password.trim()) {
            alert("Debes ingresar un username, email y una contraseña.");
            return;
        }

        const res = await axios.post("http://localhost:3001/api/register", {
            username,
            email,
            password,
        });
        setSecretUrl(res.data.secret);
        setStep("qr");
    };

    const handleLogin = async (e) => {
        e.preventDefault();
    
        if (!username.trim() || !email.trim() || !password.trim()) {
            alert("Debes ingresar un username, email y una contraseña.");
            return;
        }
    
        try {
            // Enviar los datos de login al backend
            const res = await axios.post("http://localhost:3001/api/login", {
                username,
                email,
                password,
            });
    
            if (res.data.token) {
                // Guardar token en localStorage
                localStorage.setItem("token", res.data.token);
    
                // Verificar si el token es válido (esto lo haría una API del backend)
                const verifyRes = await axios.get("http://localhost:3001/api/verify-token", {
                    headers: {
                        Authorization: `Bearer ${res.data.token}`
                    }
                });
    
                if (verifyRes.status === 200) {
                    // Si el token es válido, proceder con la siguiente acción
                    console.log("Token válido");
                } else {
                    // Si el token no es válido, eliminarlo de localStorage
                    localStorage.removeItem("token");
                    alert("El token de sesión ha expirado o es inválido.");
                    return;
                }
    
                // Si el backend requiere MFA, redirigir al siguiente paso
                if (res.data.requiresMFA) setStep("otp");
            }
        } catch (error) {
            console.error("Error al hacer login:", error);
            alert("Hubo un error al intentar iniciar sesión. Por favor, intenta de nuevo.");
        }
    };
    

    const verifyOTP = async (e) => {
        e.preventDefault();
    
        const token = localStorage.getItem("token");
        console.log("Token en localStorage:", token); // Verificar si el token existe

        try {
            const res = await axios.post("http://localhost:3001/api/verify-otp", {
                email,
                token: otp,
            });

            console.log("Respuesta del servidor:", res.data); // 🔍 Verifica qué responde el backend
    
            if (res.data.success) {
                alert("Autenticado!");
                navigate("/home");

            } else {
                alert("Código inválido");
            }
        } catch (error) {
            console.error("Error en la verificación OTP", error);
            alert("Error en la autenticación");
        }
    };
    

    return (
        <div>
            {step === "login" && (
                <form onSubmit={handleLogin}>
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <button type="submit">Login</button>
                    <button onClick={handleRegister}>Registrar</button>
                </form>
            )}

            {step === "qr" && (
                <div>
                    <QRCodeSVG value={secretUrl} />
                    <p>Escanea este QR con Google Authenticator</p>
                    <button onClick={() => setStep("login")}>Regresar</button>
                </div>
            )}

            {step === "otp" && (
                <form onSubmit={verifyOTP}>
                    <input
                        type="text"
                        placeholder="Código OTP"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                    />
                    <button type="submit" >Verificar</button>
                </form>
            )}
        </div>
    );
};

export default Login;
