import { useState, useEffect, useRef } from "react";
import { ArrowRight, AlertTriangle, X, Check } from "lucide-react";
import { validateAndLogin, getDeviceFingerprint, saveAuthSession } from "@/lib/auth";


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface LoginScreenProps {
    onLoginSuccess: () => void;
}

const LoginScreen = ({ onLoginSuccess }: LoginScreenProps) => {
    const [deviceId, setDeviceId] = useState("");
    const [key, setKey] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setDeviceId(getDeviceFingerprint());
    }, []);

    const handleLogin = async () => {
        if (!key.trim()) {
            setError("Please enter your access key.");
            return;
        }
        setLoading(true);
        setError("");
        const result = await validateAndLogin(key.trim());
        setLoading(false);
        if (result.success) {
            onLoginSuccess();
        } else {
            setError("error" in result ? result.error : "Login failed");
        }
    };

    return (
        <div
            className="fixed inset-0 z-[99999] overflow-y-auto"
            style={{
                background: "#0a0604",
            }}
        >
            {/* Ambient amber glow */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,140,40,0.45) 0%, rgba(255,90,20,0.18) 35%, rgba(10,6,4,0) 70%)",
                }}
            />

            <div className="relative min-h-full flex flex-col items-center justify-center px-5 pt-16 pb-10 max-w-md mx-auto">
                <div className="w-full text-center">
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: "#fff5e6", letterSpacing: "-0.4px" }}>
                        Enter Access Key
                    </h1>
                    <p className="mt-2" style={{ fontSize: 13, color: "rgba(255,230,200,0.55)" }}>
                        Use the key you received from admin.
                    </p>
                </div>

                <div className="w-full mt-6">
                    <input
                        type="text"
                        value={key}
                        onChange={(e) => {
                            setKey(e.target.value);
                            setError("");
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleLogin();
                        }}
                        placeholder="XXXX - XXXX - XXXX"
                        autoFocus
                        spellCheck={false}
                        autoComplete="off"
                        style={{
                            width: "100%",
                            padding: "14px",
                            borderRadius: "12px",
                            border: "1.5px solid rgba(255,150,60,0.35)",
                            background: "rgba(255,255,255,0.04)",
                            fontSize: "15px",
                            fontFamily: "'SF Mono', monospace",
                            letterSpacing: "2px",
                            color: "#fff5e6",
                            outline: "none",
                            textAlign: "center",
                        }}
                    />
                    {error && (
                        <div
                            className="flex items-start gap-2 mt-3"
                            style={{
                                padding: "10px 12px",
                                borderRadius: 8,
                                background: "rgba(255,60,60,0.1)",
                                border: "1px solid rgba(255,80,80,0.3)",
                                fontSize: 12,
                                color: "#ff8888",
                            }}
                        >
                            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>{error}</span>
                        </div>
                    )}
                    <button
                        onClick={handleLogin}
                        disabled={loading || !key.trim()}
                        className="w-full mt-4 flex items-center justify-center gap-2"
                        style={{
                            padding: "14px",
                            borderRadius: "999px",
                            border: "none",
                            background:
                                loading || !key.trim()
                                    ? "rgba(255,150,60,0.3)"
                                    : "linear-gradient(90deg, #ff7a1a 0%, #ffb347 50%, #ff7a1a 100%)",
                            color: "#1a0a04",
                            fontSize: "15px",
                            fontWeight: 700,
                            cursor: loading || !key.trim() ? "default" : "pointer",
                        }}
                    >
                        {loading ? (
                            <div
                                style={{
                                    width: 16,
                                    height: 16,
                                    border: "2px solid rgba(255,255,255,0.3)",
                                    borderTopColor: "white",
                                    borderRadius: "50%",
                                    animation: "spin 0.6s linear infinite",
                                }}
                            />
                        ) : (
                            <>
                                Unlock <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </div>



                <p style={{ marginTop: 18, fontSize: 10.5, color: "rgba(255,230,200,0.3)", textAlign: "center" }}>
                    Device · <span style={{ fontFamily: "'SF Mono', monospace" }}>{deviceId}</span>
                </p>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .rzp-direct-overlay {
                    position: absolute;
                    inset: 0;
                    z-index: 3;
                    opacity: 0.001;
                    cursor: pointer;
                    pointer-events: auto;
                    overflow: hidden;
                    border-radius: 9999px;
                }
                .rzp-direct-overlay *,
                .rzp-overlay, .rzp-overlay *,
                .razorpay-payment-button,
                .razorpay-payment-button * {
                    box-sizing: border-box !important;
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }
                .rzp-direct-overlay > div,
                .rzp-direct-overlay form,
                .rzp-direct-overlay iframe,
                .rzp-direct-overlay button,
                .rzp-direct-overlay input,
                .rzp-direct-overlay a,
                .rzp-direct-overlay .razorpay-payment-button,
                .rzp-overlay, .rzp-overlay > div, .rzp-overlay form,
                .rzp-overlay iframe, .rzp-overlay button,
                .rzp-overlay input, .rzp-overlay a {
                    position: absolute !important;
                    inset: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    min-height: 100% !important;
                    max-width: none !important;
                    border-radius: 9999px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .rzp-direct-overlay .animate-pulse,
                .rzp-direct-overlay [class*="text-red"] {
                    display: none !important;
                }
                .rzp-direct-overlay form {
                    display: block !important;
                    min-height: 0 !important;
                }
            `}</style>
        </div>
    );
};

export default LoginScreen;
