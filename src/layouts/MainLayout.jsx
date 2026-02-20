import React, { useContext } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function MainLayout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // RBAC Helper
  const isAdmin = user?.role_id === 1; // Assuming 1 is Super Admin in your DB

  return (
    <div className="d-flex h-100">
      {/* SIDEBAR */}
      <div className="sidebar d-flex flex-column">
        <div className="px-4 mb-4">
          <h4 className="text-white fw-bold m-0"><i className="fa-solid fa-layer-group text-primary me-2"></i>HOM Pulse</h4>
          <small className="text-muted">Production Env v2.0</small>
        </div>

        <ul className="nav flex-column mb-auto">
          <li className="nav-item">
            <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
              <i className="fa-solid fa-chart-line"></i> Dashboard
            </NavLink>
          </li>

          {/* Admin Only Menus */}
          {isAdmin && (
            <>
              <li className="nav-item">
                <NavLink to="/geography" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <i className="fa-solid fa-map-location-dot"></i> Geography Master
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink to="/products" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <i className="fa-solid fa-box-open"></i> Product Vault
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <i className="fa-solid fa-users-gear"></i> User Matrix
                </NavLink>
              </li>
            </>
          )}

          {/* General Menus for all users */}
          <li className="nav-item">
            <NavLink to="/orders" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <i className="fa-solid fa-truck-fast"></i> Order Hub
            </NavLink>
          </li>
        </ul>

        <div className="p-4 border-top border-secondary border-opacity-25">
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              <img src={`https://ui-avatars.com/api/?name=${user?.username}&background=2563eb&color=fff`} className="rounded-circle me-2" width="40" alt="Avatar"/>
              <div>
                <div className="text-white fw-bold" style={{ fontSize: '0.9rem' }}>{user?.username}</div>
                <div style={{ fontSize: '0.75rem', color: '#10b981' }}>Role ID: {user?.role_id}</div>
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-sm btn-outline-danger border-0"><i className="fa-solid fa-power-off"></i></button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="main-content flex-grow-1 bg-light">
        <div className="top-navbar bg-white mb-4">
          <div>
            <h5 className="m-0 fw-bold text-dark">Enterprise Gateway</h5>
          </div>
          <span className="badge bg-success bg-opacity-10 text-success border border-success px-3 py-2">
             <i className="fa-solid fa-circle-check me-1"></i> Connected to Core API
          </span>
        </div>

        {/* THIS IS WHERE THE PAGES RENDER */}
        <Outlet />
      </div>
    </div>
  );
}