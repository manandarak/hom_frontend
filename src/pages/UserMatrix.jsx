import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

const initialUserForm = {
  username: '',
  email: '',
  phone_number: '',
  password: '',
  role_id: '',
  is_active: true,
  assigned_zone_id: '',
  assigned_state_id: '',
  assigned_region_id: '',
  assigned_area_id: '',
  assigned_territory_id: ''
};

const formatPermissionName = (name) => {
  if (!name) return 'Unknown';
  return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const categorizePermissions = (permissions) => {
  const groups = {
    "Dashboards & Analytics": { icon: "fa-chart-pie text-info", perms: [] },
    "Order Management": { icon: "fa-cart-shopping text-success", perms: [] },
    "Fulfillment & Logistics": { icon: "fa-truck-fast text-warning", perms: [] },
    "Inventory Management": { icon: "fa-boxes-stacked text-primary", perms: [] },
    "Finance & Commercials": { icon: "fa-file-invoice-dollar text-danger", perms: [] },
    "Catalog & Schemes": { icon: "fa-tags text-secondary", perms: [] },
    "Network & Administration": { icon: "fa-network-wired text-dark", perms: [] },
    "Other/Uncategorized": { icon: "fa-layer-group text-muted", perms: [] }
  };

  permissions.forEach(perm => {
    const name = perm.name.toLowerCase();
    if (name.includes('dashboard') || name.includes('report') || name.includes('export')) {
      groups["Dashboards & Analytics"].perms.push(perm);
    } else if (name.includes('order')) {
      groups["Order Management"].perms.push(perm);
    } else if (name.includes('dispatch') || name.includes('receive') || name.includes('logistic')) {
      groups["Fulfillment & Logistics"].perms.push(perm);
    } else if (name.includes('inventory')) {
      groups["Inventory Management"].perms.push(perm);
    } else if (name.includes('invoice') || name.includes('payment') || name.includes('credit') || name.includes('ledger')) {
      groups["Finance & Commercials"].perms.push(perm);
    } else if (name.includes('product') || name.includes('batch') || name.includes('scheme')) {
      groups["Catalog & Schemes"].perms.push(perm);
    } else if (name.includes('partner') || name.includes('geography') || name.includes('user') || name.includes('role')) {
      groups["Network & Administration"].perms.push(perm);
    } else {
      groups["Other/Uncategorized"].perms.push(perm);
    }
  });

  Object.keys(groups).forEach(key => {
    if (groups[key].perms.length === 0) delete groups[key];
  });

  return groups;
};

export default function UserMatrix() {
  const { user } = useAuth();

  // --- STRICT RBAC EVALUATION ---
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const userPerms = user?.permissions || [];

  // The God-Mode Check
  const isAdmin = roleName?.toLowerCase() === 'admin' || userPerms.includes('manage_roles');

  // Execution Capabilities
  const canManageUsers = isAdmin || userPerms.includes('manage_users');
  const canManageRoles = isAdmin || userPerms.includes('manage_roles');

  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);

  const [geoMaster, setGeoMaster] = useState({
    zones: [], states: [], regions: [], areas: [], territories: []
  });

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);

  const [userForm, setUserForm] = useState(initialUserForm);
  const [roleForm, setRoleForm] = useState({ name: '', description: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const [matrixState, setMatrixState] = useState({});
  const [dirtyRoles, setDirtyRoles] = useState(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, permsRes, zonesRes] = await Promise.all([
        api.get('/users/').catch(err => {
            console.error("Users API crashed:", err);
            toast.error("Failed to load Users");
            return { data: [] };
        }),
        api.get('/users/roles').catch(err => {
            console.error("Roles API crashed:", err);
            toast.error("Failed to load Roles");
            return { data: [] };
        }),
        api.get('/users/permissions').catch(err => {
            console.error("Permissions API crashed:", err);
            toast.error("Failed to load Permissions");
            return { data: [] };
        }),
        api.get('/geo/zones').catch(() => ({ data: [] }))
      ]);

      const fetchedUsers = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.items || [];
      const fetchedRoles = Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data.items || [];
      const fetchedPerms = Array.isArray(permsRes.data) ? permsRes.data : permsRes.data.items || [];

      setUsers(fetchedUsers);
      setRoles(fetchedRoles);
      setPermissions(fetchedPerms);
      setGeoMaster(prev => ({ ...prev, zones: Array.isArray(zonesRes.data) ? zonesRes.data : zonesRes.data?.items || [] }));

      const initialMatrix = {};
      fetchedRoles.forEach(role => {
        initialMatrix[role.id] = role.permissions ? role.permissions.map(p => p.id || p) : [];
      });
      setMatrixState(initialMatrix);
      setDirtyRoles(new Set());

    } catch (err) {
      toast.error('Critical failure loading Identity data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSeedPermissions = async () => {
    const toastId = toast.loading('Injecting master permission list into DB...');
    try {
      await api.post('/users/seed-permissions');
      toast.success('Permissions seeded successfully!', { id: toastId });
      fetchData();
    } catch (err) {
      toast.error('Failed to seed permissions.', { id: toastId });
    }
  };

  const handleGeoChange = async (field, value) => {
    setUserForm(prev => ({ ...prev, [field]: value }));

    if (field === 'assigned_zone_id') {
      setUserForm(prev => ({ ...prev, assigned_state_id: '', assigned_region_id: '', assigned_area_id: '', assigned_territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/zones/${value}/states`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, states: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'assigned_state_id') {
      setUserForm(prev => ({ ...prev, assigned_region_id: '', assigned_area_id: '', assigned_territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/states/${value}/regions`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, regions: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'assigned_region_id') {
      setUserForm(prev => ({ ...prev, assigned_area_id: '', assigned_territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/regions/${value}/areas`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, areas: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'assigned_area_id') {
      setUserForm(prev => ({ ...prev, assigned_territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, territories: [] }));
      if (value) {
        const res = await api.get(`/geo/areas/${value}/territories`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, territories: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
  };

  const openUserModal = (selectedUser = null) => {
    if (selectedUser) {
      setEditingUserId(selectedUser.id);
      setUserForm({
        username: selectedUser.username || '',
        email: selectedUser.email || '',
        phone_number: selectedUser.phone_number || '',
        password: '',
        role_id: selectedUser.role_id || '',
        is_active: selectedUser.is_active !== undefined ? selectedUser.is_active : true,
        assigned_zone_id: selectedUser.assigned_zone_id || '',
        assigned_state_id: selectedUser.assigned_state_id || '',
        assigned_region_id: selectedUser.assigned_region_id || '',
        assigned_area_id: selectedUser.assigned_area_id || '',
        assigned_territory_id: selectedUser.assigned_territory_id || ''
      });
      setGeoMaster(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));
    } else {
      setEditingUserId(null);
      setUserForm(initialUserForm);
      setGeoMaster(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));
    }
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading(editingUserId ? 'Updating user...' : 'Provisioning user...');

    try {
      const payload = { ...userForm };
      payload.role_id = parseInt(payload.role_id);
      payload.assigned_zone_id = payload.assigned_zone_id ? parseInt(payload.assigned_zone_id) : null;
      payload.assigned_state_id = payload.assigned_state_id ? parseInt(payload.assigned_state_id) : null;
      payload.assigned_region_id = payload.assigned_region_id ? parseInt(payload.assigned_region_id) : null;
      payload.assigned_area_id = payload.assigned_area_id ? parseInt(payload.assigned_area_id) : null;
      payload.assigned_territory_id = payload.assigned_territory_id ? parseInt(payload.assigned_territory_id) : null;

      if (editingUserId) {
        if (!payload.password) delete payload.password;
        await api.patch(`/users/${editingUserId}`, payload);
        toast.success('User updated successfully', { id: toastId });
      } else {
        await api.post('/users/', payload);
        toast.success('User provisioned successfully', { id: toastId });
      }

      setIsUserModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`CRITICAL: Suspend user account for ${targetUser.username}?`)) return;
    const toastId = toast.loading(`Suspending ${targetUser.username}...`);
    try {
      await api.delete(`/users/${targetUser.id}`);
      toast.success('User suspended successfully', { id: toastId });
      fetchData();
    } catch (err) {
      toast.error('Failed to suspend user', { id: toastId });
    }
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Creating new role policy...');
    try {
      await api.post('/users/roles', roleForm);
      toast.success('Role policy created', { id: toastId });
      setIsRoleModalOpen(false);
      setRoleForm({ name: '', description: '' });
      fetchData();
    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const toggleMatrixPermission = (roleId, permId) => {
    setMatrixState(prev => {
      const rolePerms = prev[roleId] || [];
      const newPerms = rolePerms.includes(permId)
        ? rolePerms.filter(id => id !== permId)
        : [...rolePerms, permId];

      return { ...prev, [roleId]: newPerms };
    });
    setDirtyRoles(prev => new Set(prev).add(roleId));
  };

  const saveMatrixChanges = async () => {
    if (dirtyRoles.size === 0) return;
    const toastId = toast.loading(`Saving matrix changes for ${dirtyRoles.size} roles...`);
    try {
      const updatePromises = Array.from(dirtyRoles).map(roleId =>
        api.put(`/users/roles/${roleId}/permissions`, {
          permission_ids: matrixState[roleId]
        })
      );

      await Promise.all(updatePromises);
      toast.success('Permission Matrix updated successfully!', { id: toastId });
      setDirtyRoles(new Set());
      fetchData();
    } catch (err) {
      toast.error(`Error saving matrix: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  // --- DYNAMIC EXCEL EXPORT ---
  const handleExportExcel = () => {
    const toastId = toast.loading('Generating Excel File...');
    try {
      if (activeTab === 'users') {
        const exportData = filteredUsers.map(u => {
          const role = roles.find(r => r.id === u.role_id);
          return {
            'Username': u.username,
            'Email': u.email || 'N/A',
            'Phone Number': u.phone_number || 'N/A',
            'Role': role ? role.name.toUpperCase() : `ID: ${u.role_id}`,
            'Account Status': u.is_active ? 'Active' : 'Suspended',
            'Zone ID': u.assigned_zone_id || 'Global',
            'State ID': u.assigned_state_id || 'Global',
            'Region ID': u.assigned_region_id || 'Global',
            'Area ID': u.assigned_area_id || 'Global',
            'Territory ID': u.assigned_territory_id || 'Global'
          };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Active_Directory");
        XLSX.writeFile(workbook, "HoM_Active_Directory.xlsx");

      } else if (activeTab === 'matrix') {
        const exportData = [];

        Object.entries(groupedPermissions).forEach(([category, { perms }]) => {
          // Add Category Header Row
          exportData.push({ 'System Capability': `--- ${category.toUpperCase()} ---` });

          // Map Permissions to Roles
          perms.forEach(perm => {
            const row = { 'System Capability': formatPermissionName(perm.name) };
            roles.forEach(role => {
              const hasPermission = matrixState[role.id]?.includes(perm.id) || false;
              const isGodRole = role.name.toLowerCase() === 'admin';
              row[role.name.toUpperCase()] = isGodRole || hasPermission ? 'YES' : 'NO';
            });
            exportData.push(row);
          });
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Permission_Matrix");
        XLSX.writeFile(workbook, "HoM_Permission_Matrix.xlsx");
      }
      toast.success('Excel downloaded successfully!', { id: toastId });
    } catch (error) {
      console.error("Excel Export Error:", error);
      toast.error('Failed to generate Excel file.', { id: toastId });
    }
  };

  const filteredUsers = users.filter(u =>
    (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.phone_number && u.phone_number.includes(searchQuery))
  );

  const groupedPermissions = categorizePermissions(permissions);

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f4f7f8', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-fingerprint text-primary me-2"></i> Identity & Access
          </h3>
          <p className="text-muted m-0 mt-1">Manage user accounts, security roles, and system permissions.</p>
        </div>
        <div className="d-flex gap-2">
          {/* EXCEL EXPORT BUTTON */}
          <button className="btn btn-outline-success shadow-sm rounded-pill px-4 fw-semibold border-2" onClick={handleExportExcel}>
            <i className="fa-solid fa-file-excel me-2"></i> Export Excel
          </button>

          {/* SECURED PROVISION BUTTONS */}
          {activeTab === 'users' && canManageUsers && (
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => openUserModal()}>
              <i className="fa-solid fa-user-astronaut me-2"></i> Provision User
            </button>
          )}
          {activeTab === 'matrix' && canManageRoles && (
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsRoleModalOpen(true)}>
              <i className="fa-solid fa-shield-virus me-2"></i> Create New Role
            </button>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white">
        <div className="card-body p-3 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <div className="nav nav-pills p-1 bg-light rounded-pill d-inline-flex w-100 w-md-auto">
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'users' ? 'active shadow-sm fw-bold bg-primary text-white' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('users')}>
              <i className="fa-solid fa-id-card-clip me-2"></i> Active Directory
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'matrix' ? 'active shadow-sm fw-bold bg-dark text-white' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('matrix')}>
              <i className="fa-solid fa-table-cells me-2"></i> Permission Matrix
            </button>
          </div>

          {activeTab === 'users' ? (
            <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '300px' }}>
              <span className="input-group-text bg-light border-0 ps-4 text-primary"><i className="fa-solid fa-magnifying-glass"></i></span>
              <input
                type="text"
                className="form-control border-0 bg-light py-2 shadow-none fw-semibold"
                placeholder="Search usernames or emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          ) : canManageRoles ? (
             <button
                className={`btn rounded-pill px-4 fw-bold shadow-sm ${dirtyRoles.size > 0 ? 'btn-success text-white blink-animation' : 'btn-light text-muted'}`}
                onClick={saveMatrixChanges}
                disabled={dirtyRoles.size === 0}
             >
                <i className="fa-solid fa-floppy-disk me-2"></i>
                {dirtyRoles.size > 0 ? `Save ${dirtyRoles.size} Edited Roles` : 'Matrix Saved'}
             </button>
          ) : (
            <div className="badge bg-light text-muted border px-3 py-2"><i className="fa-solid fa-eye me-1"></i> Read Only View</div>
          )}
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">

        {activeTab === 'users' && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Account Status</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Identity Profile</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Access Level</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Geo Scoping</th>
                  {/* SECURED HEADER */}
                  {canManageUsers && <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canManageUsers ? "5" : "4"} className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={canManageUsers ? "5" : "4"} className="text-center py-5 text-muted">
                      <i className="fa-solid fa-user-slash fs-1 opacity-25 mb-3 d-block"></i>
                      <h5 className="fw-bold">No Users Found</h5>
                    </td>
                  </tr>
                ) : filteredUsers.map(u => {
                  const userRole = roles.find(r => r.id === u.role_id);
                  const isScoped = u.assigned_zone_id || u.assigned_region_id || u.assigned_area_id || u.assigned_territory_id;

                  return (
                    <tr key={u.id} className={!u.is_active ? 'bg-light opacity-75' : ''} style={{ transition: 'all 0.2s ease' }}>
                      <td className="px-4">
                        <span className={`badge rounded-pill px-3 py-2 ${u.is_active ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-25' : 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25'}`}>
                          <i className={`fa-solid ${u.is_active ? 'fa-circle-check' : 'fa-circle-xmark'} me-2`}></i>
                          {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          <img src={`https://ui-avatars.com/api/?name=${u.username}&background=eff6ff&color=1d4ed8&bold=true`} className="rounded-circle me-3 border border-2 border-white shadow-sm" width="45" alt="Avatar"/>
                          <div>
                            <div className="fw-bolder text-dark fs-6">{u.username}</div>
                            <small className="text-muted fw-medium d-block"><i className="fa-regular fa-envelope me-1"></i> {u.email || 'N/A'}</small>
                            <small className="text-muted fw-medium d-block"><i className="fa-solid fa-phone me-1"></i> {u.phone_number || 'N/A'}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge bg-dark bg-opacity-10 text-dark border border-dark border-opacity-25 rounded-pill px-3 py-2 fw-bold">
                          <i className="fa-solid fa-shield-cat me-2 text-primary"></i>
                          {userRole ? userRole.name.toUpperCase() : `ID: ${u.role_id}`}
                        </span>
                      </td>
                      <td>
                        {isScoped ? (
                          <span className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 px-2 py-1">
                            <i className="fa-solid fa-location-crosshairs me-1"></i> Scoped Access
                          </span>
                        ) : (
                          <span className="text-muted small fst-italic"><i className="fa-solid fa-globe me-1"></i> Global Access</span>
                        )}
                      </td>
                      {/* SECURED ACTIONS */}
                      {canManageUsers && (
                        <td className="text-end px-4">
                          <button className="btn btn-light btn-sm rounded-circle me-2 text-primary shadow-sm" onClick={() => openUserModal(u)} title="Edit Account">
                            <i className="fa-solid fa-user-pen"></i>
                          </button>
                          <button className="btn btn-light btn-sm rounded-circle text-danger shadow-sm border border-danger border-opacity-25" onClick={() => handleDeleteUser(u)} title="Suspend User">
                            <i className="fa-solid fa-user-lock"></i>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="table-responsive" style={{ maxHeight: '75vh' }}>
            <table className="table table-hover align-middle mb-0 text-center" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>

              <thead className="bg-light text-dark shadow-sm" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th className="text-start px-4 py-4 border-bottom" style={{ width: '30%', backgroundColor: '#f8f9fa' }}>
                    <div className="fs-6 fw-bold text-uppercase text-primary" style={{ letterSpacing: '1px' }}>System Capabilities</div>
                    <div className="fw-normal text-muted small mt-1">{canManageRoles ? 'Check boxes to grant module access' : 'View current system routing logic'}</div>
                  </th>
                  {roles.map(r => (
                    <th key={r.id} className="py-4 border-bottom border-start border-opacity-25" style={{ backgroundColor: '#f8f9fa', minWidth: '130px' }}>
                      <div className="d-flex flex-column align-items-center">
                         <i className="fa-solid fa-shield-halved text-primary mb-2 fs-4"></i>
                         <span className="text-uppercase fw-bolder text-dark" style={{ letterSpacing: '1px', fontSize: '0.85rem' }}>{r.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr><td colSpan={roles.length + 1} className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : permissions.length === 0 ? (
                  <tr>
                    <td colSpan={roles.length + 1} className="text-center py-5 bg-light">
                      <div className="text-muted mb-3">
                        <i className="fa-solid fa-database fs-1 opacity-25"></i>
                      </div>
                      <h5 className="fw-bold text-dark">Database is missing core permissions!</h5>
                      <p className="text-muted small">You recently reset the database. You need to seed the default permissions.</p>
                      {isAdmin && (
                        <button className="btn btn-primary shadow-sm fw-bold px-4 rounded-pill mt-3" onClick={handleSeedPermissions}>
                          <i className="fa-solid fa-seedling me-2"></i> Seed Master Permissions
                        </button>
                      )}
                    </td>
                  </tr>
                ) : Object.entries(groupedPermissions).map(([category, { icon, perms }]) => (
                  <React.Fragment key={category}>
                    <tr className="bg-light">
                      <td colSpan={roles.length + 1} className="text-start px-4 py-3 fw-bolder text-dark border-bottom border-top" style={{ backgroundColor: '#eef2f5' }}>
                        <i className={`fa-solid ${icon} me-2 fs-5 align-middle`}></i>
                        <span className="text-uppercase align-middle" style={{ letterSpacing: '1px', fontSize: '0.85rem' }}>{category}</span>
                      </td>
                    </tr>

                    {perms.map((perm, index) => (
                      <tr key={perm.id} className={`transition-all ${index === perms.length - 1 ? 'border-bottom border-2' : ''}`}>
                        <td className="text-start px-4 py-3 border-end bg-white">
                          <div className="d-flex align-items-center">
                            <i className="fa-solid fa-key text-muted me-3 opacity-25"></i>
                            <div>
                              <div className="fw-bolder text-dark" style={{ fontSize: '0.9rem' }}>{formatPermissionName(perm.name)}</div>
                              {perm.description && <div className="text-muted mt-1" style={{ fontSize: '0.75rem', fontWeight: '500' }}>{perm.description}</div>}
                            </div>
                          </div>
                        </td>
                        {roles.map(role => {
                           const hasPermission = matrixState[role.id]?.includes(perm.id) || false;
                           const isGodRole = role.name.toLowerCase() === 'admin';
                           const isChecked = isGodRole ? true : hasPermission;

                           return (
                             <td key={`${role.id}-${perm.id}`}
                                 className={`border-end cursor-pointer transition-all ${isChecked ? 'bg-success bg-opacity-10' : 'bg-white hover-bg-light'}`}
                                 onClick={() => canManageRoles && !isGodRole && toggleMatrixPermission(role.id, perm.id)}
                                 style={{ cursor: (!canManageRoles || isGodRole) ? 'not-allowed' : 'pointer' }}
                             >
                               <div className="d-flex justify-content-center align-items-center h-100">
                                 {isGodRole ? (
                                    <i className="fa-solid fa-circle-check text-success fs-4 opacity-75" title="Admins have all permissions by default"></i>
                                 ) : (
                                    <input
                                      type="checkbox"
                                      className="form-check-input fs-4 m-0 shadow-sm border-secondary border-opacity-25"
                                      checked={isChecked}
                                      onChange={() => toggleMatrixPermission(role.id, perm.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      disabled={!canManageRoles}
                                      style={{ cursor: canManageRoles ? 'pointer' : 'not-allowed' }}
                                    />
                                 )}
                               </div>
                             </td>
                           );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL: CREATE / EDIT USER (SECURED) --- */}
      {isUserModalOpen && canManageUsers && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleUserSubmit}>
                <div className={`modal-header bg-gradient text-white border-0 p-4 ${editingUserId ? 'bg-info' : 'bg-primary'}`}>
                  <div className="d-flex align-items-center">
                    <div className="bg-white bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '45px', height: '45px' }}>
                      <i className={`fa-solid ${editingUserId ? 'fa-user-pen' : 'fa-user-plus'} fs-5`}></i>
                    </div>
                    <h5 className="modal-title fw-bold m-0">
                      {editingUserId ? 'Edit Identity Profile' : 'Provision New Identity'}
                    </h5>
                  </div>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsUserModalOpen(false)}></button>
                </div>

                <div className="modal-body p-4 bg-light">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Username <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-user"></i></span>
                        <input type="text" className="form-control form-control-lg border-0 shadow-none fw-semibold" required value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} />
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Email Address</label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-envelope"></i></span>
                        <input type="email" className="form-control border-0 shadow-none py-2" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Phone Number</label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-phone"></i></span>
                        <input type="tel" className="form-control border-0 shadow-none py-2" value={userForm.phone_number} onChange={e => setUserForm({...userForm, phone_number: e.target.value})} />
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">
                        Password {editingUserId && <small className="text-info fw-normal">(Leave blank to keep)</small>} {!editingUserId && <span className="text-danger">*</span>}
                      </label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-lock"></i></span>
                        <input type="password" className="form-control border-0 shadow-none py-2" required={!editingUserId} value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                      </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Security Role <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-shield-halved"></i></span>
                        <select className="form-select border-0 shadow-none py-2 fw-semibold text-dark" required value={userForm.role_id} onChange={e => setUserForm({...userForm, role_id: e.target.value})}>
                          <option value="" disabled>Select Policy...</option>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name.toUpperCase()}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="col-12 mt-4 p-3 bg-white rounded-4 border shadow-sm">
                       <label className="form-label fw-bold text-uppercase text-primary mb-2">
                         <i className="fa-solid fa-map-location-dot me-2"></i> Geographical Hierarchy Scoping <span className="text-muted small text-transform-none fw-normal">(Optional)</span>
                       </label>
                       {editingUserId && <div className="small text-warning fw-semibold mb-3"><i className="fa-solid fa-triangle-exclamation me-1"></i> Note: To update an existing user's scope, you must re-select starting from Zone.</div>}

                       <div className="row g-2">
                          <div className="col-md-4">
                            <label className="form-label small text-muted fw-bold mb-1">Restrict Zone</label>
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={userForm.assigned_zone_id} onChange={e => handleGeoChange('assigned_zone_id', e.target.value)}>
                              <option value="">No Restriction (Global)</option>
                              {geoMaster.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-4">
                            <label className="form-label small text-muted fw-bold mb-1">Restrict State</label>
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={userForm.assigned_state_id} onChange={e => handleGeoChange('assigned_state_id', e.target.value)} disabled={!userForm.assigned_zone_id}>
                              <option value="">No State Restriction</option>
                              {geoMaster.states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-4">
                            <label className="form-label small text-muted fw-bold mb-1">Restrict Region</label>
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={userForm.assigned_region_id} onChange={e => handleGeoChange('assigned_region_id', e.target.value)} disabled={!userForm.assigned_state_id}>
                              <option value="">No Region Restriction</option>
                              {geoMaster.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small text-muted fw-bold mb-1">Restrict Area</label>
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={userForm.assigned_area_id} onChange={e => handleGeoChange('assigned_area_id', e.target.value)} disabled={!userForm.assigned_region_id}>
                              <option value="">No Area Restriction</option>
                              {geoMaster.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small text-muted fw-bold mb-1">Restrict Territory</label>
                            <select className="form-select form-select-sm border border-primary bg-light shadow-none fw-semibold text-primary" value={userForm.assigned_territory_id} onChange={e => handleGeoChange('assigned_territory_id', e.target.value)} disabled={!userForm.assigned_area_id}>
                              <option value="">No Territory Restriction</option>
                              {geoMaster.territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </div>
                       </div>
                    </div>

                    {editingUserId && (
                       <div className="col-12 mt-4 p-3 bg-white rounded-3 border shadow-sm">
                         <div className="form-check form-switch d-flex align-items-center m-0">
                           <input className="form-check-input fs-4 m-0 me-3" type="checkbox" id="activeSwitch" checked={userForm.is_active} onChange={e => setUserForm({...userForm, is_active: e.target.checked})} style={{ cursor: 'pointer' }}/>
                           <label className="form-check-label fw-bolder text-dark" htmlFor="activeSwitch" style={{ cursor: 'pointer' }}>
                             Account Active Status
                             <div className="small text-muted fw-normal">Toggle to immediately suspend or activate this user.</div>
                           </label>
                         </div>
                       </div>
                    )}
                  </div>
                </div>

                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsUserModalOpen(false)}>Cancel</button>
                  <button type="submit" className={`btn fw-bold px-5 rounded-pill shadow-sm ${editingUserId ? 'btn-info text-white' : 'btn-primary'}`}>
                    <i className="fa-solid fa-cloud-arrow-up me-2"></i> {editingUserId ? 'Save Profile' : 'Deploy Identity'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: CREATE ROLE (SECURED) --- */}
      {isRoleModalOpen && canManageRoles && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleRoleSubmit}>
                <div className="modal-header bg-dark bg-gradient text-white border-0 p-4">
                  <div className="d-flex align-items-center">
                    <div className="bg-white bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '45px', height: '45px' }}>
                      <i className="fa-solid fa-shield-plus fs-5"></i>
                    </div>
                    <h5 className="modal-title fw-bold m-0">Create Security Policy</h5>
                  </div>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsRoleModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <div className="mb-4">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Policy Tag <span className="text-danger">*</span></label>
                    <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                      <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-tag"></i></span>
                      <input type="text" className="form-control form-control-lg border-0 shadow-none text-uppercase fw-bold" placeholder="e.g. REGIONAL_MANAGER" required value={roleForm.name} onChange={e => setRoleForm({...roleForm, name: e.target.value})} />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Policy Description</label>
                    <textarea className="form-control border shadow-sm rounded-3 p-3 bg-white" rows="3" placeholder="Define the scope of this security role..." value={roleForm.description} onChange={e => setRoleForm({...roleForm, description: e.target.value})}></textarea>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsRoleModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-dark fw-bold px-5 rounded-pill shadow-sm bg-gradient">
                    <i className="fa-solid fa-shield-check me-2"></i> Initialize Role
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(25, 135, 84, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(25, 135, 84, 0); }
          100% { box-shadow: 0 0 0 0 rgba(25, 135, 84, 0); }
        }
        .blink-animation { animation: pulse 2s infinite; }
        .hover-bg-light:hover { background-color: #f8f9fa !important; }
        .drop-shadow { filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.3)); }
      `}</style>
    </div>
  );
}