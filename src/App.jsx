import React, { useState } from 'react';
import CommandCenter from './components/CommandCenter';
import AuthTest from './components/AuthTest';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const triggerFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="d-flex">
      <div className="sidebar d-flex flex-column">
        <div className="px-4 mb-4">
          <h4 className="text-white fw-bold m-0">
            <i className="fa-solid fa-layer-group text-primary me-2"></i>
            HOM Pulse
          </h4>
          <small className="text-muted">Enterprise Tester v1.0</small>
        </div>

        <ul className="nav flex-column mb-auto">
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              <i className="fa-solid fa-chart-line"></i> Command Center
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'auth' ? 'active' : ''}`} onClick={() => setActiveTab('auth')}>
              <i className="fa-solid fa-shield-halved"></i> Auth Testing
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'geo' ? 'active' : ''}`} onClick={() => setActiveTab('geo')}>
              <i className="fa-solid fa-map-location-dot"></i> Geo Testing
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${activeTab === 'order' ? 'active' : ''}`} onClick={() => setActiveTab('order')}>
              <i className="fa-solid fa-truck-fast"></i> Order Testing
            </button>
          </li>
        </ul>

        <div className="p-4 border-top border-secondary border-opacity-25">
          <div className="d-flex align-items-center">
            <img src="https://ui-avatars.com/api/?name=Dev+Tester&background=2563eb&color=fff" className="rounded-circle me-2" width="40" alt="Avatar"/>
            <div>
              <div className="text-white fw-bold" style={{ fontSize: '0.9rem' }}>Dev Environment</div>
              <div style={{ fontSize: '0.75rem', color: '#10b981' }}>Connected</div>
            </div>
          </div>
        </div>
      </div>

      <div className="main-content flex-grow-1">
        <div className="top-navbar">
          <div>
            <h5 className="m-0 fw-bold text-dark">
              {activeTab === 'dashboard' && "Executive Dashboard"}
              {activeTab === 'auth' && "Authentication Module Testing"}
              {activeTab === 'geo' && "Geography Module Testing"}
              {activeTab === 'order' && "Sales & Orders Testing"}
            </h5>
            <small className="text-muted">Connected to: http://127.0.0.1:8000</small>
          </div>
          <div>
            <span className="badge bg-success bg-opacity-10 text-success border border-success me-2 px-3 py-2">
              <i className="fa-solid fa-circle-check me-1"></i> API Online
            </span>
            <button className="btn btn-primary btn-sm px-3" onClick={triggerFullscreen}>
              <i className="fa-solid fa-display me-1"></i> Fullscreen
            </button>
          </div>
        </div>

        {activeTab === 'dashboard' && <CommandCenter />}
        {activeTab === 'auth' && <AuthTest />}
        {activeTab === 'geo' && <div className="test-panel"><h4>GeoTest Component Placeholder</h4></div>}
        {activeTab === 'order' && <div className="test-panel"><h4>OrderTest Component Placeholder</h4></div>}
      </div>
    </div>
  );
}

export default App;