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

const ProtectedRoute = ({ children, requiredPermissions = [] }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <div className="d-flex justify-content-center align-items-center vh-100"><div className="spinner-border text-primary"></div></div>;
  if (!user) return <Navigate to="/login" replace />;

  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const isAdmin = roleName?.toLowerCase() === 'admin';
  const userPerms = user.permissions || [];

  if (isAdmin) return children;

  if (requiredPermissions.length > 0) {
    const hasPermission = requiredPermissions.some(perm => userPerms.includes(perm));
    if (!hasPermission) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />

          <Route path="geography" element={
            <ProtectedRoute requiredPermissions={['view_geography']}>
              <GeographyMaster />
            </ProtectedRoute>
          } />
          <Route path="products" element={
            <ProtectedRoute requiredPermissions={['view_products']}>
              <ProductMaster />
            </ProtectedRoute>
          } />
          <Route path="partners" element={
            <ProtectedRoute requiredPermissions={['view_partners']}>
              <PartnerMaster />
            </ProtectedRoute>
          } />

          <Route path="users" element={
            <ProtectedRoute requiredPermissions={['view_users', 'manage_users']}>
              <UserMatrix />
            </ProtectedRoute>
          } />

          <Route path="inventory" element={
            <ProtectedRoute requiredPermissions={['view_inventory']}>
              <InventoryMaster />
            </ProtectedRoute>
          } />
          <Route path="finance" element={
            <ProtectedRoute requiredPermissions={['view_invoices', 'view_ledgers']}>
              <FinanceMaster />
            </ProtectedRoute>
          } />
          <Route path="orders" element={
            <ProtectedRoute requiredPermissions={['view_all_orders', 'view_own_orders', 'create_primary_order', 'create_secondary_order']}>
              <OrderHub />
            </ProtectedRoute>
          } />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;