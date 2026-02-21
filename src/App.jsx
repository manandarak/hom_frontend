import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';

import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GeographyMaster from './pages/GeographyMaster';
import ProductMaster from './pages/ProductMaster';
import PartnerMaster from './pages/PartnerMaster';
import InventoryMaster from './pages/InventoryMaster';
import UserMatrix from './pages/UserMatrix.jsx';
import FinanceMaster from './pages/FinanceMaster.jsx';
import OrderHub from "./pages/OrderHub.jsx";

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Loading Enterprise Core...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<Login />} />

        {/* Secure App Routes wrapped in the MainLayout */}
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          {/* Default path (/) loads Dashboard */}
          <Route index element={<Dashboard />} />

          {/* Core Modules */}
          <Route path="geography" element={<GeographyMaster />} />
          <Route path="inventory" element={<InventoryMaster />} />
          <Route path="products" element={<ProductMaster />} />
          <Route path="partners" element={<PartnerMaster />} />

          {/* Identity & Access Management */}
          <Route path="users" element={<UserMatrix />} />
          <Route path="finance" element={<FinanceMaster />} />
          <Route path="order-hub" element={<OrderHub />} />

          {/* Placeholders for remaining modules */}
          <Route path="orders" element={<div className="p-4"><h1>Order Hub</h1><p>API connection pending...</p></div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;