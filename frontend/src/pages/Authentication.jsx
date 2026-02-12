import * as React from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { AuthContext } from "../contexts/AuthContext";
import "./Authentication.css";

export default function Authentication() {
    const [name,      setName]      = React.useState("");
    const [username,  setUsername]  = React.useState("");
    const [password,  setPassword]  = React.useState("");

    const [formState, setFormState] = React.useState(0); // 0 = login, 1 = signup
    const [message,   setMessage]   = React.useState("");
    const [error,     setError]     = React.useState("");
    const [open,      setOpen]      = React.useState(false);
    const [loading,   setLoading]   = React.useState(false);

    const { handleRegister, handleLogin } = React.useContext(AuthContext);

    const resetForm = () => { setName(""); setUsername(""); setPassword(""); };

    const handleAuth = async () => {
        if (!username.trim() || !password.trim()) {
            setError("Please fill in all fields");
            setOpen(true);
            return;
        }
        setLoading(true);
        try {
            if (formState === 0) {
                await handleLogin(username, password);
                setMessage("Welcome back!");
            } else {
                if (!name.trim()) { setError("Please enter your name"); setOpen(true); setLoading(false); return; }
                const result = await handleRegister(name, username, password);
                setMessage(result || "Account created! Please sign in.");
                resetForm();
                setFormState(0);
            }
            setError("");
            setOpen(true);
        } catch (err) {
            setError(err.response?.data?.message || "Something went wrong. Please try again.");
            setMessage("");
            setOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => { if (e.key === "Enter") handleAuth(); };

    return (
        <div className="auth-root">
            <div className="auth-bg-mesh" />

            <div className="auth-container">
                {/* Logo */}
                <div className="auth-logo">
                    <div className="auth-logo-icon">📹</div>
                    <h1 className="auth-logo-title">Apna Video Call</h1>
                    <p className="auth-logo-sub">Connect with anyone, anywhere</p>
                </div>

                {/* Toggle */}
                <div className="auth-toggle">
                    <button
                        className={`auth-tab ${formState === 0 ? "auth-tab--active" : ""}`}
                        onClick={() => { setFormState(0); resetForm(); }}
                    >
                        Sign In
                    </button>
                    <button
                        className={`auth-tab ${formState === 1 ? "auth-tab--active" : ""}`}
                        onClick={() => { setFormState(1); resetForm(); }}
                    >
                        Sign Up
                    </button>
                    <div className={`auth-tab-slider ${formState === 1 ? "auth-tab-slider--right" : ""}`} />
                </div>

                {/* Subtitle */}
                <p className="auth-subtitle">
                    {formState === 0 ? "Enter your credentials to continue" : "Create your free account"}
                </p>

                {/* Form */}
                <div className="auth-form">
                    {formState === 1 && (
                        <div className="auth-field">
                            <label>Full Name</label>
                            <input
                                type="text"
                                placeholder="John Doe"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                    )}

                    <div className="auth-field">
                        <label>Username</label>
                        <input
                            type="text"
                            placeholder="your_username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoComplete="username"
                        />
                    </div>

                    <div className="auth-field">
                        <label>Password</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoComplete={formState === 0 ? "current-password" : "new-password"}
                        />
                    </div>

                    {formState === 0 && (
                        <label className="auth-remember">
                            <input type="checkbox" />
                            <span>Remember me</span>
                        </label>
                    )}

                    <button
                        className={`auth-submit ${loading ? "auth-submit--loading" : ""}`}
                        onClick={handleAuth}
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="auth-spinner" />
                        ) : (
                            formState === 0 ? "Sign In" : "Create Account"
                        )}
                    </button>
                </div>

                <p className="auth-switch">
                    {formState === 0 ? "Don't have an account? " : "Already have an account? "}
                    <button onClick={() => { setFormState(formState === 0 ? 1 : 0); resetForm(); }}>
                        {formState === 0 ? "Sign up" : "Sign in"}
                    </button>
                </p>
            </div>

            <Snackbar
                open={open}
                autoHideDuration={4000}
                onClose={() => setOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity={error ? "error" : "success"}
                    onClose={() => setOpen(false)}
                    variant="filled"
                    sx={{ borderRadius: "10px", fontFamily: "inherit" }}
                >
                    {error || message}
                </Alert>
            </Snackbar>
        </div>
    );
}