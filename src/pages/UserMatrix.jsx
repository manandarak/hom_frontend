import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

const initialUserForm = {
  username: '',
  email: '',
  password: '', // Only used for creation
  role_id: '',
  is_active: true
};

export default function UserMatrix() {
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'roles'
  const [loading, setLoading] = useState(false);

  // Data States
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);

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
      const [usersRes, rolesRes, permsRes] = await Promise.all([
        api.get('/users/'),
        api.get('/users/roles'),
        api.get('/users/permissions')
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.items || []);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data.items || []);
      setPermissions(Array.isArray(permsRes.data) ? permsRes.data : permsRes.data.items || []);
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

  // --- USER MUTATIONS ---

  const openUserModal = (user = null) => {
    if (user) {
      setEditingUserId(user.id);
      setUserForm({
        username: user.username || '',
        email: user.email || '',
        password: '', // Never pre-fill passwords
        role_id: user.role_id || '',
        is_active: user.is_active !== undefined ? user.is_active : true
      });
    } else {
      setEditingUserId(null);
      setUserForm(initialUserForm);
    }
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading(editingUserId ? 'Updating user...' : 'Provisioning user...');

    try {
      const payload = { ...userForm };
      payload.role_id = parseInt(payload.role_id);

      if (editingUserId) {
        // If editing and password is blank, don't send it
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
    if (!window.confirm(`Critical Action: Suspend user account for ${user.username}?`)) return;
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
    // Assuming role.permissions is an array of permission objects or IDs
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
      // API expects a list of permission IDs to assign to the role
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

  // Safe filtering for users
  const filteredUsers = users.filter(u =>
    (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-users-gear text-primary me-2"></i> User Matrix
          </h3>
          <p className="text-muted m-0 mt-1">Identity, Access, and RBAC Policy Management.</p>
        </div>
        <div className="d-flex gap-2">
          {activeTab === 'users' ? (
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => openUserModal()}>
              <i className="fa-solid fa-user-plus me-2"></i> Provision User
            </button>
          ) : (
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsRoleModalOpen(true)}>
              <i className="fa-solid fa-shield-halved me-2"></i> Create Policy Role
            </button>
          )}
        </div>
      </div>

      {/* TIER NAVIGATION */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-2 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <div className="nav nav-pills p-1 bg-light rounded-pill d-inline-flex w-100 w-md-auto">
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'users' ? 'active shadow-sm fw-bold' : 'text-dark'}`} onClick={() => setActiveTab('users')}>
              <i className="fa-solid fa-users me-2"></i> Active Directory
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'roles' ? 'active shadow-sm fw-bold bg-dark text-white' : 'text-dark'}`} onClick={() => setActiveTab('roles')}>
              <i className="fa-solid fa-key me-2"></i> Roles & Permissions
            </button>
          </div>

          {activeTab === 'users' && (
            <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '300px' }}>
              <span className="input-group-text bg-white border-0 ps-4"><i className="fa-solid fa-magnifying-glass text-muted"></i></span>
              <input
                type="text"
                className="form-control border-0 bg-white py-2 shadow-none"
                placeholder="Search users..."
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
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Status</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>User Profile</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Assigned Role</th>
                  <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-5 text-muted fw-bold">No users found.</td></tr>
                ) : filteredUsers.map(u => {
                  const userRole = roles.find(r => r.id === u.role_id);
                  return (
                    <tr key={u.id} className={!u.is_active ? 'bg-light opacity-75' : ''}>
                      <td className="px-4">
                        <span className={`badge rounded-pill px-3 py-2 ${u.is_active ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                          <i className={`fa-solid ${u.is_active ? 'fa-check-circle' : 'fa-ban'} me-1`}></i> {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          <img src={`https://ui-avatars.com/api/?name=${u.username}&background=f8f9fa&color=333`} className="rounded-circle me-3 border shadow-sm" width="40" alt="Avatar"/>
                          <div>
                            <div className="fw-bolder text-dark fs-6">{u.username}</div>
                            <small className="text-muted fw-semibold">{u.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 rounded-pill px-3 py-2">
                          <i className="fa-solid fa-shield-halved me-1 text-primary"></i> {userRole ? userRole.name : `Role ID: ${u.role_id}`}
                        </span>
                      </td>
                      <td className="text-end px-4">
                        <button className="btn btn-light btn-sm rounded-circle me-2 text-primary shadow-sm" onClick={() => openUserModal(u)} title="Edit Details">
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button className="btn btn-light btn-sm rounded-circle text-danger shadow-sm" onClick={() => handleDeleteUser(u)} title="Suspend User">
                          <i className="fa-solid fa-user-xmark"></i>
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
                  <th className="px-4 py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Role ID</th>
                  <th className="py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Policy Name</th>
                  <th className="py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Capabilities</th>
                  <th className="text-end px-4 py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Policy Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : roles.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-5 text-muted">No roles configured.</td></tr>
                ) : roles.map(role => (
                  <tr key={role.id}>
                    <td className="px-4 font-monospace text-muted">POL-{role.id}</td>
                    <td className="fw-bolder text-dark text-uppercase">{role.name}</td>
                    <td>
                      <span className="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 rounded-pill px-3 py-1">
                        {role.permissions ? role.permissions.length : 0} Permissions Attached
                      </span>
                    </td>
                    <td className="text-end px-4">
                      <button className="btn btn-outline-dark btn-sm rounded-pill px-3 fw-semibold shadow-sm" onClick={() => openPermissionModal(role)}>
                        <i className="fa-solid fa-sliders me-1"></i> Modify Access
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
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleUserSubmit}>
                <div className={`modal-header bg-gradient text-white border-0 p-4 ${editingUserId ? 'bg-info' : 'bg-primary'}`}>
                  <h5 className="modal-title fw-bold">
                    <i className={`fa-solid ${editingUserId ? 'fa-user-pen' : 'fa-user-plus'} me-2`}></i>
                    {editingUserId ? 'Edit Account Data' : 'Provision New Account'}
                  </h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsUserModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Username <span className="text-danger">*</span></label>
                      <input type="text" className="form-control form-control-lg border-0 shadow-sm rounded-3" required value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Email Address <span className="text-danger">*</span></label>
                      <input type="email" className="form-control border-0 shadow-sm rounded-3 py-2" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">
                        Password {editingUserId && <small className="text-info fw-normal">(Leave blank to keep)</small>} {!editingUserId && <span className="text-danger">*</span>}
                      </label>
                      <input type="password" className="form-control border-0 shadow-sm rounded-3 py-2" required={!editingUserId} value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Assign Role <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2" required value={userForm.role_id} onChange={e => setUserForm({...userForm, role_id: e.target.value})}>
                        <option value="" disabled>Select Policy...</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name.toUpperCase()}</option>)}
                      </select>
                    </div>
                    {editingUserId && (
                       <div className="col-12 mt-3">
                         <div className="form-check form-switch">
                           <input className="form-check-input" type="checkbox" id="activeSwitch" checked={userForm.is_active} onChange={e => setUserForm({...userForm, is_active: e.target.checked})} />
                           <label className="form-check-label fw-bold text-dark" htmlFor="activeSwitch">Account Active Status</label>
                         </div>
                       </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsUserModalOpen(false)}>Cancel</button>
                  <button type="submit" className={`btn fw-semibold px-5 rounded-pill shadow-sm ${editingUserId ? 'btn-info text-white' : 'btn-primary'}`}>
                    {editingUserId ? 'Save Changes' : 'Initialize Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: CREATE ROLE --- */}
      {isRoleModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleRoleSubmit}>
                <div className="modal-header bg-dark bg-gradient text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-shield-plus me-2"></i> Create Policy Role</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsRoleModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Policy Name <span className="text-danger">*</span></label>
                    <input type="text" className="form-control form-control-lg border-0 shadow-sm rounded-3 text-uppercase" placeholder="e.g. REGIONAL_MANAGER" required value={roleForm.name} onChange={e => setRoleForm({...roleForm, name: e.target.value})} />
                  </div>
                  <div className="mb-2">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Description</label>
                    <textarea className="form-control border-0 shadow-sm rounded-3" rows="3" placeholder="Define what this role does..." value={roleForm.description} onChange={e => setRoleForm({...roleForm, description: e.target.value})}></textarea>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsRoleModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-dark fw-semibold px-5 rounded-pill shadow-sm">Initialize Role</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: MODIFY PERMISSIONS --- */}
      {isPermissionModalOpen && activeRoleForPerms && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-dark text-white border-0 p-4">
                <h5 className="modal-title fw-bold">
                  <i className="fa-solid fa-sliders me-2"></i> Access Matrix: <span className="text-info">{activeRoleForPerms.name}</span>
                </h5>
                <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsPermissionModalOpen(false)}></button>
              </div>
              <div className="modal-body p-0 bg-light">
                <div className="list-group list-group-flush">
                  {permissions.length === 0 ? (
                    <div className="p-4 text-center text-muted">No system permissions found.</div>
                  ) : permissions.map(perm => (
                    <label key={perm.id} className="list-group-item d-flex justify-content-between align-items-center p-3 cursor-pointer hover-bg-light border-0 border-bottom">
                      <div>
                        <div className="fw-bold text-dark">{perm.name || perm.codename}</div>
                        <small className="text-muted">{perm.description || `Capability ID: ${perm.id}`}</small>
                      </div>
                      <div className="form-check form-switch fs-4 m-0">
                        <input
                          className="form-check-input"
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
                <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsPermissionModalOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-dark fw-semibold px-5 rounded-pill shadow-sm" onClick={handlePermissionsSubmit}>Enforce Policy</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}