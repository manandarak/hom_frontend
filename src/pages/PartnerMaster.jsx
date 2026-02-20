import React, { useState, useEffect } from 'react';
import api from '../api';

export default function PartnerMaster() {
  const [partners, setPartners] = useState({ ss: [], distributors: [], retailers: [] });
  const [activeTab, setActiveTab] = useState('ss'); // ss, distributors, retailers
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State for dynamic tier creation
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    territory_id: '',
    gstin: '',
    is_active: true
  });

  useEffect(() => {
    fetchAllPartners();
  }, []);

  const fetchAllPartners = async () => {
    setLoading(true);
    try {
      const [ssRes, distRes, retRes] = await Promise.all([
        api.get('/partner/super-stockists'),
        api.get('/partner/distributors'),
        api.get('/partner/retailers')
      ]);
      setPartners({
        ss: ssRes.data,
        distributors: distRes.data,
        retailers: retRes.data
      });
    } catch (err) {
      console.error("Failed to load partner matrix", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePartner = async (e) => {
    e.preventDefault();
    const endpoint = activeTab === 'ss' ? 'super-stockists' : activeTab === 'distributors' ? 'distributors' : 'retailers';
    try {
      await api.post(`/partner/${endpoint}`, formData);
      setIsModalOpen(false);
      fetchAllPartners();
    } catch (err) {
      alert("Error creating partner: " + (err.response?.data?.detail || err.message));
    }
  };

  const togglePartnerStatus = async (id, currentStatus) => {
    const endpoint = activeTab === 'ss' ? 'super-stockists' : activeTab === 'distributors' ? 'distributors' : 'retailers';
    try {
      await api.patch(`/partner/${endpoint}/${id}`, { is_active: !currentStatus });
      fetchAllPartners();
    } catch (err) {
      alert("Status update failed.");
    }
  };

  const activeList = activeTab === 'ss' ? partners.ss : activeTab === 'distributors' ? partners.distributors : partners.retailers;

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold m-0"><i className="fa-solid fa-handshake text-primary me-2"></i> Partner Matrix</h4>
          <small className="text-muted">Manage network nodes: Super Stockists, Distributors, and Retailers</small>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <i className="fa-solid fa-user-plus me-2"></i> Add New {activeTab.toUpperCase()}
        </button>
      </div>

      {/* TIER NAVIGATION */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-2">
          <ul className="nav nav-pills nav-fill">
            <li className="nav-item">
              <button className={`nav-link ${activeTab === 'ss' ? 'active' : ''}`} onClick={() => setActiveTab('ss')}>
                <i className="fa-solid fa-warehouse me-2"></i> Super Stockists
              </button>
            </li>
            <li className="nav-item">
              <button className={`nav-link ${activeTab === 'distributors' ? 'active' : ''}`} onClick={() => setActiveTab('distributors')}>
                <i className="fa-solid fa-truck-ramp-box me-2"></i> Distributors
              </button>
            </li>
            <li className="nav-item">
              <button className={`nav-link ${activeTab === 'retailers' ? 'active' : ''}`} onClick={() => setActiveTab('retailers')}>
                <i className="fa-solid fa-shop me-2"></i> Retailers
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* PARTNER GRID */}
      <div className="card border-0 shadow-sm rounded-4">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light small text-uppercase">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th>Entity Name</th>
                <th>Contact info</th>
                <th>Territory ID</th>
                <th>GSTIN</th>
                <th className="text-end px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-5"><div className="spinner-border spinner-border-sm text-primary"></div></td></tr>
              ) : activeList.map(p => (
                <tr key={p.id} className={!p.is_active ? 'opacity-50' : ''}>
                  <td className="px-4">
                    <span className={`badge ${p.is_active ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                      {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td>
                    <div className="fw-bold text-dark">{p.name}</div>
                    <small className="text-muted">ID: #{p.id}</small>
                  </td>
                  <td>
                    <div className="small"><i className="fa-solid fa-user text-muted me-2"></i>{p.contact_person}</div>
                    <div className="small"><i className="fa-solid fa-phone text-muted me-2"></i>{p.phone}</div>
                  </td>
                  <td><span className="badge bg-light text-dark border">T-{p.territory_id}</span></td>
                  <td><code className="text-primary fw-bold">{p.gstin || 'N/A'}</code></td>
                  <td className="text-end px-4">
                    <button className="btn btn-sm btn-outline-secondary me-2"><i className="fa-solid fa-eye"></i></button>
                    <button
                      className={`btn btn-sm ${p.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                      onClick={() => togglePartnerStatus(p.id, p.is_active)}
                    >
                      <i className={`fa-solid ${p.is_active ? 'fa-user-slash' : 'fa-user-check'}`}></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {isModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow rounded-4">
              <form onSubmit={handleCreatePartner}>
                <div className="modal-header bg-dark text-white rounded-top-4 border-0">
                  <h5 className="modal-title">Provision New {activeTab.toUpperCase()}</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setIsModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-muted">Business Name</label>
                      <input type="text" className="form-control" required onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-muted">Contact Person</label>
                      <input type="text" className="form-control" onChange={e => setFormData({...formData, contact_person: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-muted">Phone Number</label>
                      <input type="text" className="form-control" onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-muted">Territory ID (Assigned)</label>
                      <input type="number" className="form-control" required onChange={e => setFormData({...formData, territory_id: parseInt(e.target.value)})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-muted">GSTIN</label>
                      <input type="text" className="form-control" onChange={e => setFormData({...formData, gstin: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0">
                  <button type="button" className="btn btn-light" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary px-4">Create Node</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}