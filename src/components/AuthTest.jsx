import React, { useState, useEffect } from 'react';
import api from '../api';

export default function AuthTest() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // App-level states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [rawResponse, setRawResponse] = useState(null); // For debugging/testing

  // Check for existing session on component mount
  useEffect(() => {
    const token = localStorage.getItem('hom_token');
    if (token) {
      fetchUserProfile();
    }
  }, []);

  const fetchUserProfile = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/users/me'); // Hits the secure FastAPI endpoint
      setCurrentUser(res.data);
      setRawResponse({ type: 'success', data: res.data });
    } catch (err) {
      // If token is invalid/expired, clear it out
      localStorage.removeItem('hom_token');
      setCurrentUser(null);
      setRawResponse({ type: 'error', data: err.response?.data || err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setRawResponse(null);

    try {
      // FastAPI OAuth2PasswordRequestForm expects URL-encoded data
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      // Save token and instantly fetch user details
      localStorage.setItem('hom_token', res.data.access_token);
      await fetchUserProfile();

      // Clear form
      setUsername('');
      setPassword('');
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Invalid credentials or server error";
      setError(errMsg);
      setRawResponse({ type: 'error', data: err.response?.data || err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hom_token');
    setCurrentUser(null);
    setRawResponse(null);
  };

  const handleManualTest = async (endpoint) => {
    setIsLoading(true);
    try {
      const res = await api.get(endpoint);
      setRawResponse({ type: 'success', data: res.data });
    } catch (err) {
      setRawResponse({ type: 'error', data: err.response?.data || err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="row g-4">
      {/* LEFT COLUMN: Auth Interface */}
      <div className="col-lg-5">
        <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden">
          <div className="card-header bg-dark text-white p-4 border-0">
            <h5 className="m-0 fw-bold">
              <i className="fa-solid fa-fingerprint text-primary me-2"></i>
              Access Control
            </h5>
            <small className="text-secondary">Enterprise Identity Management</small>
          </div>

          <div className="card-body p-4">
            {/* Conditional Rendering: Show Profile if logged in, else Form */}
            {currentUser ? (
              <div className="text-center py-4">
                <div className="position-relative d-inline-block mb-3">
                  <img
                    src={`https://ui-avatars.com/api/?name=${currentUser.username}&background=2563eb&color=fff&size=80`}
                    className="rounded-circle shadow-sm"
                    alt="User"
                  />
                  <span className="position-absolute bottom-0 end-0 p-2 bg-success border border-white rounded-circle" title="Online"></span>
                </div>
                <h4 className="fw-bold mb-1">{currentUser.username}</h4>
                <span className="badge bg-primary bg-opacity-10 text-primary mb-3 px-3 py-2">
                  Role ID: {currentUser.role_id || 'Not Assigned'}
                </span>
                <p className="text-muted small mb-4">
                  ID: {currentUser.id} • Active: {currentUser.is_active ? 'Yes' : 'No'}
                </p>
                <button onClick={handleLogout} className="btn btn-outline-danger w-100 fw-medium">
                  <i className="fa-solid fa-arrow-right-from-bracket me-2"></i> Secure Logout
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin}>
                {error && (
                  <div className="alert alert-danger d-flex align-items-center py-2 px-3 small rounded-3 mb-4">
                    <i className="fa-solid fa-triangle-exclamation me-2"></i> {error}
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label text-muted small fw-bold text-uppercase">Username</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0 text-muted">
                      <i className="fa-regular fa-envelope"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0 bg-light py-2"
                      placeholder="Enter identity..."
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="form-label text-muted small fw-bold text-uppercase">Passcode</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-end-0 text-muted">
                      <i className="fa-solid fa-lock"></i>
                    </span>
                    <input
                      type="password"
                      className="form-control border-start-0 bg-light py-2"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-100 py-2 fw-bold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span> Authenticating...</>
                  ) : (
                    <><i className="fa-solid fa-right-to-bracket me-2"></i> Authorize Session</>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: API Testing & Debugger Console */}
      <div className="col-lg-7">
        <div className="card border-0 shadow-sm rounded-4 h-100">
          <div className="card-header bg-white border-bottom p-3 d-flex justify-content-between align-items-center">
            <h6 className="m-0 fw-bold text-dark"><i className="fa-solid fa-network-wired text-muted me-2"></i> Security Endpoints</h6>
            <div className="btn-group">
              <button
                onClick={() => handleManualTest('/users/me')}
                className="btn btn-sm btn-outline-secondary"
                disabled={!currentUser || isLoading}
              >
                GET /users/me
              </button>
              <button
                onClick={() => handleManualTest('/users/roles')}
                className="btn btn-sm btn-outline-secondary"
                disabled={!currentUser || isLoading}
              >
                GET /roles
              </button>
            </div>
          </div>
          <div className="card-body p-0 bg-dark" style={{ borderBottomLeftRadius: '1rem', borderBottomRightRadius: '1rem' }}>
            <div className="terminal p-4 h-100" style={{ minHeight: '350px' }}>
              <div className="text-muted mb-2">// Network traffic intercepted...</div>
              {isLoading && <div className="text-warning"><i className="fa-solid fa-circle-notch fa-spin me-2"></i> Awaiting response...</div>}

              {rawResponse && !isLoading && (
                <div className={rawResponse.type === 'error' ? 'text-danger' : 'text-success'}>
                  <div className="mb-2">
                    {rawResponse.type === 'error' ? 'HTTP 4xx/5xx - FAILURE' : 'HTTP 200 - OK'}
                  </div>
                  <pre className="mb-0" style={{ color: rawResponse.type === 'error' ? '#ef4444' : '#10b981' }}>
                    {JSON.stringify(rawResponse.data, null, 2)}
                  </pre>
                </div>
              )}

              {!rawResponse && !isLoading && (
                <div className="text-secondary">Ready to intercept requests. Please initiate an action.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}