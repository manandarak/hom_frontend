import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      navigate('/'); // Redirect to dashboard on success
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid credentials. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-light">
      <div className="card shadow-lg border-0 rounded-4" style={{ maxWidth: '450px', width: '100%' }}>
        <div className="card-body p-5">
          <div className="text-center mb-4">
            <h3 className="fw-bold text-dark"><i className="fa-solid fa-layer-group text-primary me-2"></i>HOM Pulse</h3>
            <p className="text-muted">Enterprise Identity Access</p>
          </div>

          {error && <div className="alert alert-danger py-2 small"><i className="fa-solid fa-circle-exclamation me-1"></i> {error}</div>}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label small fw-bold text-muted text-uppercase">Username</label>
              <input type="text" className="form-control py-2 bg-light" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="mb-4">
              <label className="form-label small fw-bold text-muted text-uppercase">Password</label>
              <input type="password" className="form-control py-2 bg-light" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary w-100 py-2 fw-bold" disabled={isSubmitting}>
              {isSubmitting ? 'Authenticating...' : 'Secure Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}