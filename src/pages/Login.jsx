import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FaEye, FaEyeSlash } from 'react-icons/fa'; // Eye icons

export default function Login() {
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
              style={{ width: '200px', height: '100px' }}
            />
          </div>

          {error && (
            <div className="alert alert-danger py-2 small">
              <i className="fa-solid fa-circle-exclamation me-1"></i> {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label small fw-bold text-muted text-uppercase">
                Username
              </label>
              <input
                type="text"
                className="form-control py-2 bg-light bg-opacity-50"
                style={{ backdropFilter: 'blur(5px)' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="mb-4 position-relative">
              <label className="form-label small fw-bold text-muted text-uppercase">
                Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control py-2 bg-light bg-opacity-50"
                style={{ backdropFilter: 'blur(5px)' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '38px',
                  cursor: 'pointer',
                  color: '#555',
                  fontSize: '1.1rem',
                }}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 fw-bold"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Authenticating...' : 'Secure Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}