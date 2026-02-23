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
  const isAdmin = user?.role_id === 1; // Assuming 1 is Super Admin

  // --- STYLING HELPER ---
  // This keeps all your links perfectly uniform with great spacing
  const getNavLinkClass = ({ isActive }) =>
    `nav-link px-4 py-3 mb-1 fw-semibold d-flex align-items-center rounded-end-pill me-3 transition-all ` +
    (isActive
      ? 'active bg-primary bg-opacity-10 text-primary border-start border-4 border-primary'
      : 'text-secondary hover-bg-light');

  

  return (
    <div className="d-flex" style={{ minHeight: '100vh', backgroundColor: '#f4f7f8' }}>

      {/* --- SIDEBAR (Now Clean White) --- */}
      <div className="sidebar d-flex flex-column bg-white border-end shadow-sm" style={{ width: '280px', zIndex: 10 }}>

        {/* LOGO AREA */}
        <div className="p-4 mb-2 text-center border-bottom border-light">
          <img
            src="/src/assets/logo.png"
            alt="HOM Pulse Logo"
            style={{ width: '180px', height: 'auto', objectFit: 'contain' }}
            className="mb-2"
          />
          <div className="small fw-bold text-muted text-uppercase tracking-wider" style={{ letterSpacing: '1px', fontSize: '0.7rem' }}>
            Production Env v2.0
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="flex-grow-1 overflow-auto py-3">
          <ul className="nav flex-column mb-auto">

            <li className="nav-item">
              <NavLink to="/" className={getNavLinkClass} end>
                <i className="fa-solid fa-chart-pie me-3 fs-5" style={{ width: '24px' }}></i> Dashboard
              </NavLink>
            </li>

            {/* Admin Only Menus */}
            {isAdmin && (
              <>
                <li className="nav-item mt-3 mb-1 px-4 text-uppercase text-muted fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>
                  Core Infrastructure
                </li>

                <li className="nav-item">
                  <NavLink to="/geography" className={getNavLinkClass}>
                    <i className="fa-solid fa-map-location-dot me-3 fs-5" style={{ width: '24px' }}></i> Geo Master
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/products" className={getNavLinkClass}>
                    <i className="fa-solid fa-box-open me-3 fs-5" style={{ width: '24px' }}></i> Product Vault
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/partners" className={getNavLinkClass}>
                    <i className="fa-solid fa-network-wired me-3 fs-5" style={{ width: '24px' }}></i> Partner Matrix
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/users" className={getNavLinkClass}>
                    <i className="fa-solid fa-users-gear me-3 fs-5" style={{ width: '24px' }}></i> User Matrix
                  </NavLink>
                </li>

                <li className="nav-item mt-3 mb-1 px-4 text-uppercase text-muted fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>
                  Operations
                </li>

                <li className="nav-item">
                  <NavLink to="/inventory" className={getNavLinkClass}>
                    <i className="fa-solid fa-boxes-stacked me-3 fs-5" style={{ width: '24px' }}></i> Inventory Control
                  </NavLink>
                </li>
                <li className="nav-item">
                  <NavLink to="/finance" className={getNavLinkClass}>
                    <i className="fa-solid fa-indian-rupee-sign me-3 fs-5" style={{ width: '24px' }}></i> Finance Ledger
                  </NavLink>
                </li>
              </>
            )}

            <li className="nav-item mt-3 mb-1 px-4 text-uppercase text-muted fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>
              Execution
            </li>

            {/* General Menus for all users */}
            <li className="nav-item">
              {/* FIXED LINK: changed from /order-hub to /orders to match App.jsx */}
              <NavLink to="/orders" className={getNavLinkClass}>
                <i className="fa-solid fa-truck-fast me-3 fs-5" style={{ width: '24px' }}></i> Order Hub
              </NavLink>
            </li>

          </ul>
        </div>

        {/* BOTTOM USER PROFILE AREA */}
        <div className="p-3 border-top border-light bg-light bg-opacity-50">
          <div className="d-flex justify-content-between align-items-center bg-white border shadow-sm rounded-4 p-2">
            <div className="d-flex align-items-center overflow-hidden">
              <img src={`https://ui-avatars.com/api/?name=${user?.username}&background=eff6ff&color=1d4ed8&bold=true`} className="rounded-circle border border-2 border-white shadow-sm me-2 flex-shrink-0" width="40" alt="Avatar"/>
              <div className="text-truncate" style={{ maxWidth: '130px' }}>
                <div className="text-dark fw-bold text-truncate" style={{ fontSize: '0.85rem' }}>{user?.username || 'Admin User'}</div>
                <div className="text-primary fw-semibold" style={{ fontSize: '0.7rem' }}>Security Level: {user?.role_id || '1'}</div>
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-light text-danger rounded-circle shadow-sm border border-danger border-opacity-25" style={{ width: '35px', height: '35px', flexShrink: 0 }} title="Logout">
              <i className="fa-solid fa-power-off"></i>
            </button>
          </div>
        </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="main-content flex-grow-1 d-flex flex-column overflow-hidden">

        {/* TOP NAVBAR */}
        <div className="top-navbar bg-white border-bottom shadow-sm px-4 py-3 d-flex justify-content-between align-items-center flex-shrink-0" style={{ zIndex: 5 }}>
          <h5 className="m-0 fw-bolder text-dark" style={{ letterSpacing: '-0.5px' }}>Enterprise Gateway</h5>
          <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill shadow-sm">
             <i className="fa-solid fa-circle-check me-1 align-middle"></i> Core API Connected
          </span>
        </div>

        {/* THIS IS WHERE THE PAGES RENDER */}
        <div className="flex-grow-1 overflow-auto custom-scrollbar">
          <Outlet />
        </div>

      </div>
    </div>
  );
}