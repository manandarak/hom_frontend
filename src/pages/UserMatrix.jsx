import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

const initialUserForm = {
  username: '',
  email: '',
  password: '',
  role_id: '',
  is_active: true,
  assigned_zone_id: '',
  assigned_state_id: '',
  assigned_region_id: '',
  assigned_area_id: '',
  assigned_territory_id: ''
};

export default function UserMatrix() {
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'roles'
  const [loading, setLoading] = useState(false);

  // Data States
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);

  // Geo Hierarchy State
  const [geoMaster, setGeoMaster] = useState({
    zones: [], states: [], regions: [], areas: [], territories: []
  });

  // Modal States
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);

  // Tracking Edit States
  const [editingUserId, setEditingUserId] = useState(null);
  const [activeRoleForPerms, setActiveRoleForPerms] = useState(null);

  // Forms
  const [userForm, setUserForm] = useState(initialUserForm);
  const [roleForm, setRoleForm] = useState({ name: '', description: '' });
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // --- API FETCHERS ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, permsRes, zonesRes] = await Promise.all([
        api.get('/users/'),
        api.get('/users/roles'),
        api.get('/users/permissions'),
        api.get('/geo/zones').catch(() => ({ data: [] })) // Fetch base zones
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.items || []);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data.items || []);
      setPermissions(Array.isArray(permsRes.data) ? permsRes.data : permsRes.data.items || []);

      setGeoMaster(prev => ({
        ...prev,
        zones: Array.isArray(zonesRes.data) ? zonesRes.data : zonesRes.data?.items || []
      }));

    } catch (err) {
      toast.error('Failed to load Identity & Access data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- CASCADING GEO HANDLER FOR USER FORM ---
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

  // --- USER MUTATIONS ---
  const openUserModal = (user = null) => {
    if (user) {
      setEditingUserId(user.id);
      setUserForm({
        username: user.username || '',
        email: user.email || '',
        password: '',
        role_id: user.role_id || '',
        is_active: user.is_active !== undefined ? user.is_active : true,
        assigned_zone_id: user.assigned_zone_id || '',
        assigned_state_id: user.assigned_state_id || '',
        assigned_region_id: user.assigned_region_id || '',
        assigned_area_id: user.assigned_area_id || '',
        assigned_territory_id: user.assigned_territory_id || ''
      });
      // Clear downstream geo lists. User must re-select from top to modify existing hierarchy
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

      // Parse integers or null for geo scoping
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

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`CRITICAL: Suspend user account for ${user.username}?`)) return;
    const toastId = toast.loading(`Suspending ${user.username}...`);
    try {
      await api.delete(`/users/${user.id}`);
      toast.success('User suspended successfully', { id: toastId });
      fetchData();
    } catch (err) {
      toast.error('Failed to suspend user', { id: toastId });
    }
  };

  // --- ROLE & PERMISSION MUTATIONS ---
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

  const openPermissionModal = (role) => {
    setActiveRoleForPerms(role);
    const existingPermIds = role.permissions ? role.permissions.map(p => p.id || p) : [];
    setSelectedPermissionIds(existingPermIds);
    setIsPermissionModalOpen(true);
  };

  const togglePermission = (permId) => {
    setSelectedPermissionIds(prev =>
      prev.includes(permId) ? prev.filter(id => id !== permId) : [...prev, permId]
    );
  };

  const handlePermissionsSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Applying permission policy...');
    try {
      await api.put(`/users/roles/${activeRoleForPerms.id}/permissions`, {
        permission_ids: selectedPermissionIds
      });
      toast.success('Policy applied successfully', { id: toastId });
      setIsPermissionModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(`Error applying policy: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const filteredUsers = users.filter(u =>
    (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f4f7f8', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-fingerprint text-primary me-2"></i> Identity & Access
          </h3>
          <p className="text-muted m-0 mt-1">Manage user accounts, security roles, and system permissions.</p>
        </div>
        <div className="d-flex gap-2">
          {activeTab === 'users' ? (
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => openUserModal()}>
              <i className="fa-solid fa-user-astronaut me-2"></i> Provision User
            </button>
          ) : (
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsRoleModalOpen(true)}>
              <i className="fa-solid fa-shield-virus me-2"></i> Create Policy Role
            </button>
          )}
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="row g-4 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden bg-white">
            <div className="card-body d-flex align-items-center p-4">
              <div className="bg-primary bg-opacity-10 text-primary p-3 rounded-circle me-4 d-flex align-items-center justify-content-center" style={{ width: '60px', height: '60px' }}>
                <i className="fa-solid fa-users fs-3"></i>
              </div>
              <div>
                <h6 className="text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '0.8rem', letterSpacing: '1px' }}>Total Accounts</h6>
                <h2 className="fw-bolder mb-0 text-dark">{users.length}</h2>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden bg-white">
            <div className="card-body d-flex align-items-center p-4">
              <div className="bg-success bg-opacity-10 text-success p-3 rounded-circle me-4 d-flex align-items-center justify-content-center" style={{ width: '60px', height: '60px' }}>
                <i className="fa-solid fa-user-shield fs-3"></i>
              </div>
              <div>
                <h6 className="text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '0.8rem', letterSpacing: '1px' }}>Security Roles</h6>
                <h2 className="fw-bolder mb-0 text-dark">{roles.length}</h2>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden bg-white">
            <div className="card-body d-flex align-items-center p-4">
              <div className="bg-warning bg-opacity-10 text-warning p-3 rounded-circle me-4 d-flex align-items-center justify-content-center" style={{ width: '60px', height: '60px' }}>
                <i className="fa-solid fa-key fs-3"></i>
              </div>
              <div>
                <h6 className="text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '0.8rem', letterSpacing: '1px' }}>System Permissions</h6>
                <h2 className="fw-bolder mb-0 text-dark">{permissions.length}</h2>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TIER NAVIGATION */}
      <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white">
        <div className="card-body p-3 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <div className="nav nav-pills p-1 bg-light rounded-pill d-inline-flex w-100 w-md-auto">
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'users' ? 'active shadow-sm fw-bold bg-primary text-white' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('users')}>
              <i className="fa-solid fa-id-card-clip me-2"></i> Active Directory
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'roles' ? 'active shadow-sm fw-bold bg-dark text-white' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('roles')}>
              <i className="fa-solid fa-shield-halved me-2"></i> Roles & Policies
            </button>
          </div>

          {activeTab === 'users' && (
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
          )}
        </div>
      </div>

      {/* DYNAMIC CONTENT AREA */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">

        {/* VIEW: USERS */}
        {activeTab === 'users' && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Account Status</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Identity Profile</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Access Level</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Geo Scoping</th>
                  <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-5 text-muted">
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
                            <small className="text-muted fw-medium"><i className="fa-regular fa-envelope me-1"></i> {u.email || 'N/A'}</small>
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
                      <td className="text-end px-4">
                        <button className="btn btn-light btn-sm rounded-circle me-2 text-primary shadow-sm" onClick={() => openUserModal(u)} title="Edit Account">
                          <i className="fa-solid fa-user-pen"></i>
                        </button>
                        <button className="btn btn-light btn-sm rounded-circle text-danger shadow-sm border border-danger border-opacity-25" onClick={() => handleDeleteUser(u)} title="Suspend User">
                          <i className="fa-solid fa-user-lock"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW: ROLES & PERMISSIONS */}
        {activeTab === 'roles' && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-4 py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Policy Tag</th>
                  <th className="py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Security Role</th>
                  <th className="py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Granted Capabilities</th>
                  <th className="text-end px-4 py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Enforcement</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : roles.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-5 text-muted">
                      <i className="fa-solid fa-shield-slash fs-1 opacity-25 mb-3 d-block"></i>
                      <h5 className="fw-bold">No Roles Configured</h5>
                    </td>
                  </tr>
                ) : roles.map(role => (
                  <tr key={role.id}>
                    <td className="px-4">
                      <code className="bg-dark bg-opacity-10 text-dark px-2 py-1 rounded fw-bold border">POL-{role.id}</code>
                    </td>
                    <td>
                      <div className="d-flex align-items-center">
                        <div className="bg-warning bg-opacity-10 text-warning rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '40px', height: '40px' }}>
                          <i className="fa-solid fa-id-badge fs-5"></i>
                        </div>
                        <div>
                          <div className="fw-bolder text-dark fs-6 text-uppercase">{role.name}</div>
                          <div className="small text-muted text-truncate" style={{ maxWidth: '250px' }}>{role.description || 'No description provided.'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-50 rounded-pill px-3 py-2 fw-bold">
                        <i className="fa-solid fa-unlock-keyhole me-2"></i>
                        {role.permissions ? role.permissions.length : 0} Permissions
                      </span>
                    </td>
                    <td className="text-end px-4">
                      <button className="btn btn-dark btn-sm rounded-pill px-4 fw-semibold shadow-sm border-0 bg-gradient" onClick={() => openPermissionModal(role)}>
                        <i className="fa-solid fa-sliders me-2"></i> Configure Matrix
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL: CREATE / EDIT USER --- */}
      {isUserModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
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

                    {/* CORE USER DETAILS */}
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Username <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-user"></i></span>
                        <input type="text" className="form-control form-control-lg border-0 shadow-none fw-semibold" required value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} />
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Email Address</label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-envelope"></i></span>
                        <input type="email" className="form-control border-0 shadow-none py-2" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
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

                    {/* NEW: GEOGRAPHICAL HIERARCHY SCOPING */}
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

                    {/* STATUS SWITCH */}
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

      {/* --- MODAL: CREATE ROLE --- */}
      {isRoleModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
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

      {/* --- MODAL: MODIFY PERMISSIONS --- */}
      {isPermissionModalOpen && activeRoleForPerms && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-dark bg-gradient text-white border-0 p-4">
                <div className="d-flex align-items-center">
                  <div className="bg-warning bg-opacity-25 text-warning rounded-circle d-flex justify-content-center align-items-center me-3 border border-warning border-opacity-50" style={{ width: '45px', height: '45px' }}>
                    <i className="fa-solid fa-network-wired fs-5"></i>
                  </div>
                  <div>
                    <h5 className="modal-title fw-bold m-0">Access Matrix</h5>
                    <div className="small text-white-50 font-monospace">TARGET: {activeRoleForPerms.name.toUpperCase()}</div>
                  </div>
                </div>
                <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsPermissionModalOpen(false)}></button>
              </div>

              <div className="modal-body p-0 bg-light">
                <div className="p-3 bg-warning bg-opacity-10 border-bottom border-warning border-opacity-25 text-dark small fw-semibold d-flex align-items-center">
                  <i className="fa-solid fa-triangle-exclamation text-warning fs-5 me-3"></i>
                  Warning: Modifying these permissions will instantly alter access for all users assigned to this role.
                </div>

                <div className="list-group list-group-flush">
                  {permissions.length === 0 ? (
                    <div className="p-5 text-center text-muted">
                      <i className="fa-solid fa-server fs-1 opacity-25 mb-3 d-block"></i>
                      No system permissions registered in the API.
                    </div>
                  ) : permissions.map(perm => (
                    <label key={perm.id} className="list-group-item d-flex justify-content-between align-items-center p-3 cursor-pointer hover-bg-light border-0 border-bottom">
                      <div className="d-flex align-items-center">
                        <div className="me-3 text-muted opacity-50"><i className="fa-solid fa-key"></i></div>
                        <div>
                          <div className="fw-bolder text-dark">{perm.name || perm.codename}</div>
                          <small className="text-muted">{perm.description || `Capability Module ID: ${perm.id}`}</small>
                        </div>
                      </div>
                      <div className="form-check form-switch fs-3 m-0">
                        <input
                          className="form-check-input shadow-sm border-secondary border-opacity-25"
                          type="checkbox"
                          checked={selectedPermissionIds.includes(perm.id)}
                          onChange={() => togglePermission(perm.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="modal-footer border-0 p-4 bg-white shadow-sm" style={{ zIndex: 10 }}>
                <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsPermissionModalOpen(false)}>Abort</button>
                <button type="button" className="btn btn-dark fw-bold px-5 rounded-pill shadow-sm bg-gradient" onClick={handlePermissionsSubmit}>
                  <i className="fa-solid fa-lock me-2"></i> Enforce Policy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}