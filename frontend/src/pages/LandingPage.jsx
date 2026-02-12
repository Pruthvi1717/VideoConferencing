import React from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";
import "./LandingPage.css";

export default function LandingPage() {
    const { userData, handleLogout } = React.useContext(AuthContext);

    return (
        <div className="landing-root">
            {/* Mesh background */}
            <div className="landing-mesh" />

            {/* ── Nav ── */}
            <nav className="landing-nav">
                <Link to="/" className="landing-brand">
                    <span className="brand-icon">📹</span>
                    <span className="brand-name">Apna Video Call</span>
                </Link>

                <div className="landing-navlinks">
                    {userData ? (
                        <>
                            <div className="user-chip">
                                <span className="user-avatar">{userData.name?.[0]?.toUpperCase()}</span>
                                <span>{userData.name}</span>
                            </div>
                            <Link to="/home" className="nav-btn nav-btn--outline">Dashboard</Link>
                            <button className="nav-btn nav-btn--ghost" onClick={handleLogout}>Logout</button>
                        </>
                    ) : (
                        <>
                            <Link to="/home" className="nav-btn nav-btn--ghost">Join as Guest</Link>
                            <Link to="/auth" className="nav-btn nav-btn--outline">Register</Link>
                            <Link to="/auth" className="nav-btn nav-btn--primary">Login</Link>
                        </>
                    )}
                </div>
            </nav>

            {/* ── Hero ── */}
            <main className="landing-hero">
                <div className="hero-content">
                    <div className="hero-badge">
                        <span className="badge-dot" />
                        Free to use · No downloads needed
                    </div>

                    <h1 className="hero-title">
                        <span>Connect with your</span>
                        <br />
                        <span className="hero-highlight">loved ones</span>
                    </h1>

                    <p className="hero-sub">
                        HD video calls, screen sharing, and live chat —
                        all in your browser. No sign-up required to join.
                    </p>

                    <div className="hero-cta">
                        <Link to={userData ? "/home" : "/home"} className="cta-primary">
                            <span>🎬</span>
                            {userData ? "Go to Dashboard" : "Start a Meeting"}
                        </Link>
                        {!userData && (
                            <Link to="/auth" className="cta-secondary">
                                Sign up free
                            </Link>
                        )}
                    </div>

                    <div className="hero-stats">
                        <div className="stat">
                            <span className="stat-value">HD</span>
                            <span className="stat-label">Video Quality</span>
                        </div>
                        <div className="stat-divider" />
                        <div className="stat">
                            <span className="stat-value">∞</span>
                            <span className="stat-label">Meeting Length</span>
                        </div>
                        <div className="stat-divider" />
                        <div className="stat">
                            <span className="stat-value">🔒</span>
                            <span className="stat-label">End-to-End</span>
                        </div>
                    </div>
                </div>

                <div className="hero-visual">
                    <div className="phone-frame">
                        <img src="/mobile.png" alt="App preview" />
                        <div className="phone-glow" />
                    </div>

                    {/* floating chips */}
                    <div className="floating-chip chip-1">
                        <span>🎤</span> Live audio
                    </div>
                    <div className="floating-chip chip-2">
                        <span>🖥️</span> Screen share
                    </div>
                    <div className="floating-chip chip-3">
                        <span>💬</span> In-meeting chat
                    </div>
                </div>
            </main>
        </div>
    );
}