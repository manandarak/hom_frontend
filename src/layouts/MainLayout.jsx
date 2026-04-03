import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // --- THEME TOGGLE STATE ---
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  // --- LANGUAGE SELECTION STATE ---
  const [currentLang, setCurrentLang] = useState(() => {
    return localStorage.getItem('app-language') || 'en';
  });

  const languages = [
    { code: 'en', name: 'English', label: 'English' },
    { code: 'hi', name: 'हिन्दी', label: 'Hindi' },
    { code: 'bn', name: 'বাংলা', label: 'Bengali' },
    { code: 'te', name: 'తెలుగు', label: 'Telugu' },
    { code: 'mr', name: 'मराठी', label: 'Marathi' },
    { code: 'ta', name: 'தமிழ்', label: 'Tamil' },
    { code: 'gu', name: 'ગુજરાતી', label: 'Gujarati' },
    { code: 'kn', name: 'ಕನ್ನಡ', label: 'Kannada' }
  ];

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-theme');
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      document.documentElement.removeAttribute('data-bs-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleLanguageChange = (langCode) => {
    setCurrentLang(langCode);
    localStorage.setItem('app-language', langCode);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // --- BULLETPROOF RBAC LOGIC ---
  const userPerms = user?.permissions || [];

  // Note: Depending on your backend, user.role might be an object {name: 'Admin'} or a string 'Admin'
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const isAdmin = roleName?.toLowerCase() === 'admin';

  // Core Infra - Checks permissions OR overrides if Admin
  const canViewGeo = isAdmin || userPerms.includes("view_geography");
  const canViewProducts = isAdmin || userPerms.includes("view_products");
  const canViewPartners = isAdmin || userPerms.includes("view_partners");
  const canViewUsers = isAdmin || userPerms.includes("view_users") || userPerms.includes("manage_users");

  const canViewInventory = isAdmin || userPerms.includes("view_inventory");
  const canViewFinance = isAdmin || userPerms.includes("view_invoices") || userPerms.includes("view_ledgers");


  const canViewProduction = isAdmin || userPerms.includes("view_production") || userPerms.includes("manage_production");

  const canViewOrders = isAdmin || userPerms.includes("view_all_orders") || userPerms.includes("view_own_orders") || userPerms.includes("create_primary_order") || userPerms.includes("create_secondary_order");

  const showCoreInfra = canViewGeo || canViewProducts || canViewPartners || canViewUsers;
  const showOperations = canViewInventory || canViewFinance || canViewProduction;

  const getNavLinkClass = ({ isActive }) =>
    `nav-link px-4 py-3 mb-1 fw-semibold d-flex align-items-center rounded-end-pill me-3 transition-all ` +
    (isActive
      ? 'active bg-primary bg-opacity-10 text-primary border-start border-4 border-primary'
      : 'text-secondary hover-bg-light');

  return (
    <div className="d-flex theme-transition" style={{ minHeight: '100vh', backgroundColor: isDarkMode ? '#0B1120' : '#f4f7f8' }}>

      {/* --- SIDEBAR --- */}
      <div className="sidebar d-flex flex-column bg-white border-end shadow-sm" style={{ width: '280px', zIndex: 10 }}>

        {/* LOGO AREA */}
        <div className="p-4 mb-2 text-center border-bottom border-light">
          <img
            // src="/src/assets/logo.png"
            alt="HOM Pulse Logo"
            style={{ width: '180px', height: 'auto', objectFit: 'contain' }}
            className="mb-2"
          />
          <div className="small fw-bold text-muted text-uppercase tracking-wider" style={{ letterSpacing: '1px', fontSize: '0.7rem' }}>
            Production Env v2.0
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="flex-grow-1 overflow-auto py-3 custom-scrollbar">
          <ul className="nav flex-column mb-auto">
            {/* Everyone gets a dashboard */}
            <li className="nav-item">
              <NavLink to="/" className={getNavLinkClass} end>
                <i className="fa-solid fa-chart-pie me-3 fs-5" style={{ width: '24px' }}></i> Dashboard
              </NavLink>
            </li>

            {showCoreInfra && (
              <li className="nav-item mt-3 mb-1 px-4 text-uppercase text-muted fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>
                Core Infrastructure
              </li>
            )}

            {canViewGeo && (
              <li className="nav-item"><NavLink to="/geography" className={getNavLinkClass}><i className="fa-solid fa-map-location-dot me-3 fs-5" style={{ width: '24px' }}></i> Geo Master</NavLink></li>
            )}
            {canViewProducts && (
              <li className="nav-item"><NavLink to="/products" className={getNavLinkClass}><i className="fa-solid fa-box-open me-3 fs-5" style={{ width: '24px' }}></i> Product Vault</NavLink></li>
            )}
            {canViewPartners && (
              <li className="nav-item"><NavLink to="/partners" className={getNavLinkClass}><i className="fa-solid fa-network-wired me-3 fs-5" style={{ width: '24px' }}></i> Partner Matrix</NavLink></li>
            )}
            {canViewUsers && (
              <li className="nav-item"><NavLink to="/users" className={getNavLinkClass}><i className="fa-solid fa-users-gear me-3 fs-5" style={{ width: '24px' }}></i> User Matrix</NavLink></li>
            )}

            {showOperations && (
              <li className="nav-item mt-3 mb-1 px-4 text-uppercase text-muted fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>
                Operations
              </li>
            )}

            {/* NEW: Factory Floor Navigation Link */}
            {canViewProduction && (
              <li className="nav-item"><NavLink to="/production" className={getNavLinkClass}><i className="fa-solid fa-industry me-3 fs-5" style={{ width: '24px' }}></i> Factory Floor</NavLink></li>
            )}

            {canViewInventory && (
              <li className="nav-item"><NavLink to="/inventory" className={getNavLinkClass}><i className="fa-solid fa-boxes-stacked me-3 fs-5" style={{ width: '24px' }}></i> Inventory Control</NavLink></li>
            )}
            {canViewFinance && (
              <li className="nav-item"><NavLink to="/finance" className={getNavLinkClass}><i className="fa-solid fa-indian-rupee-sign me-3 fs-5" style={{ width: '24px' }}></i> Finance Ledger</NavLink></li>
            )}

            {canViewOrders && (
              <>
                <li className="nav-item mt-3 mb-1 px-4 text-uppercase text-muted fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>
                  Execution
                </li>
                <li className="nav-item">
                  <NavLink to="/orders" className={getNavLinkClass}>
                    <i className="fa-solid fa-truck-fast me-3 fs-5" style={{ width: '24px' }}></i> Order Hub
                  </NavLink>
                </li>
              </>
            )}
          </ul>
        </div>

        {/* BOTTOM USER PROFILE AREA */}
        <div className="p-3 border-top border-light bg-light bg-opacity-50">
          <div className="d-flex justify-content-between align-items-center bg-white border shadow-sm rounded-4 p-2">
            <div className="d-flex align-items-center overflow-hidden">
              <img src={`https://ui-avatars.com/api/?name=${user?.username || 'User'}&background=eff6ff&color=1d4ed8&bold=true`} className="rounded-circle border border-2 border-white shadow-sm me-2 flex-shrink-0" width="40" alt="Avatar"/>
              <div className="text-truncate" style={{ maxWidth: '130px' }}>
                <div className="text-dark fw-bold text-truncate" style={{ fontSize: '0.85rem' }}>{user?.username || 'Unknown User'}</div>
                <div className="text-primary fw-semibold text-truncate" style={{ fontSize: '0.7rem' }}>Role: {roleName || 'Admin'}</div>
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

          <div className="d-flex align-items-center gap-2">
             <div className="dropdown">
               <button className="btn btn-light dropdown-toggle d-flex align-items-center shadow-sm border rounded-pill px-3" type="button" id="languageDropdown" data-bs-toggle="dropdown" aria-expanded="false" style={{ height: '40px' }}>
                 <i className="fa-solid fa-language fs-5 me-2 text-primary"></i>
                 <span className="fw-semibold small d-none d-lg-inline">{languages.find(l => l.code === currentLang)?.name}</span>
               </button>
               <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2" aria-labelledby="languageDropdown">
                 <li className="dropdown-header text-uppercase small fw-bold">Select Language</li>
                 {languages.map((lang) => (
                   <li key={lang.code}>
                     <button className={`dropdown-item d-flex justify-content-between align-items-center py-2 ${currentLang === lang.code ? 'active bg-primary text-white' : ''}`} onClick={() => handleLanguageChange(lang.code)}>
                       <span>{lang.name} <small className="opacity-75 ms-1">({lang.label})</small></span>
                       {currentLang === lang.code && <i className="fa-solid fa-check ms-2 fs-xs"></i>}
                     </button>
                   </li>
                 ))}
               </ul>
             </div>

             <button onClick={toggleTheme} className="btn btn-light rounded-circle shadow-sm border" style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
                <i className={`fa-solid ${isDarkMode ? 'fa-sun text-warning fs-5' : 'fa-moon text-secondary fs-5'}`}></i>
             </button>

             <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill shadow-sm d-none d-sm-inline-block">
               <i className="fa-solid fa-circle-check me-1 align-middle"></i> Core API Connected
             </span>
          </div>
        </div>

        {/* RENDER PAGES HERE */}
        <div className="flex-grow-1 overflow-auto custom-scrollbar">
          <Outlet />
        </div>

      </div>
    </div>
  );
}