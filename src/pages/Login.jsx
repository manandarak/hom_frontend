import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FaEye, FaEyeSlash } from 'react-icons/fa'; // Eye icons

export default function Login() {
  // Keeping the state variable named 'username' so it doesn't break your AuthContext,
  // but it now handles both username and email.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      await login(username, password);
      navigate('/'); // Redirect on success
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid credentials. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center vh-100"
      style={{
        backgroundImage: "url('https://cdn.shopify.com/s/files/1/0749/7557/6242/files/malhotra_hosue_sketch.png?v=1770835017')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className="card shadow-lg border-0 rounded-4"
        style={{
          maxWidth: '450px',
          width: '100%',
          backgroundColor: 'rgba(255, 255, 255, 0.2)', // mostly transparent
          backdropFilter: 'blur(10px)', // glass effect
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <img
              src="/src/assets/logo.png"
              alt="House of Malhotra Logo"
              style={{ width: '200px', height: '100px', objectFit: 'contain' }}
            />
          </div>

          {error && (
            <div className="alert alert-danger py-2 small fw-semibold border-0 shadow-sm">
              <i className="fa-solid fa-circle-exclamation me-1"></i> {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label small fw-bolder text-dark text-uppercase" style={{ letterSpacing: '0.5px' }}>
                Username or Email
              </label>
              <div className="input-group bg-light bg-opacity-50 rounded-3 overflow-hidden shadow-sm border border-white">
                <span className="input-group-text bg-transparent border-0 text-dark opacity-50">
                  <i className="fa-solid fa-user"></i>
                </span>
                <input
                  type="text"
                  className="form-control py-2 bg-transparent border-0 shadow-none fw-semibold text-dark"
                  placeholder="Enter username or email..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small fw-bolder text-dark text-uppercase m-0" style={{ letterSpacing: '0.5px' }}>
                  Password
                </label>
                {/* Placeholder link for the Forgot Password flow you built in the backend */}
                <a href="#forgot-password" className="small fw-bold text-primary text-decoration-none" style={{ fontSize: '0.75rem' }}>
                  Forgot Password?
                </a>
              </div>
              <div className="input-group bg-light bg-opacity-50 rounded-3 overflow-hidden shadow-sm border border-white position-relative">
                <span className="input-group-text bg-transparent border-0 text-dark opacity-50">
                  <i className="fa-solid fa-lock"></i>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control py-2 bg-transparent border-0 shadow-none fw-semibold text-dark pe-5"
                  placeholder="Enter your password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <span
                  onClick={() => setShowPassword(!showPassword)}
                  className="position-absolute end-0 top-50 translate-middle-y pe-3"
                  style={{
                    cursor: 'pointer',
                    color: '#333',
                    fontSize: '1.1rem',
                    zIndex: 10 // ensures it stays clickable above the input
                  }}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 fw-bold shadow-sm rounded-3 mt-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><span className="spinner-border spinner-border-sm me-2"></span> Authenticating...</>
              ) : (
                <><i className="fa-solid fa-right-to-bracket me-2"></i> Secure Login</>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}