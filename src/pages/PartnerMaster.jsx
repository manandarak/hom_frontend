import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

const initialFormState = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  parent_ss_id: '',
  linked_distributor_id: '',
  gstin: '',
  is_active: true
};

export default function PartnerMaster() {
  const [partners, setPartners] = useState({ ss: [], distributors: [], retailers: [] });
  const [activeTab, setActiveTab] = useState('ss'); // ss, distributors, retailers
  const [loading, setLoading] = useState(true);

  // --- CASCADING GEO STATE ---
  const [geoMaster, setGeoMaster] = useState({
    zones: [], states: [], regions: [], areas: [], territories: []
  });
  const [geoFilter, setGeoFilter] = useState({
    zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: ''
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState(initialFormState);

  // Helper to map tab state to exact API endpoint strings
  const getEndpoint = () => {
    if (activeTab === 'ss') return 'super-stockists';
    if (activeTab === 'distributors') return 'distributors';
    return 'retailers';
  };

  // NORMALIZERS
  const getPartnerName = (p) => p.name || p.firm_name || p.shop_name || "Unknown Entity";
  const getContactPerson = (p) => p.contact_person || "Not Provided";
  const getPhone = (p) => p.phone || p.contact_number || "";

  // Helper for Table Display
  const getRegionDisplay = (p) => {
     if (activeTab === 'ss') return p.zone_id ? `Zone ID: ${p.zone_id}` : 'Unassigned';
     if (activeTab === 'distributors') return p.state_id ? `State ID: ${p.state_id}` : 'Unassigned';
     return p.territory_id ? `Territory ID: ${p.territory_id}` : 'Unassigned';
  };

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const [ssRes, distRes, retRes, zonesRes] = await Promise.all([
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] })),
          api.get('/geo/zones').catch(() => ({ data: [] })) // Only fetch root zones!
        ]);

        setPartners({
          ss: Array.isArray(ssRes.data) ? ssRes.data : ssRes.data.items || [],
          distributors: Array.isArray(distRes.data) ? distRes.data : distRes.data.items || [],
          retailers: Array.isArray(retRes.data) ? retRes.data : retRes.data.items || []
        });

        setGeoMaster(prev => ({
          ...prev,
          zones: Array.isArray(zonesRes.data) ? zonesRes.data : zonesRes.data?.items || []
        }));

      } catch (err) {
        console.error("Hydration failed", err);
        toast.error("Failed to load initial data.");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const refetchPartners = async () => {
    try {
      const [ssRes, distRes, retRes] = await Promise.all([
        api.get('/partners/super-stockists').catch(() => ({ data: [] })),
        api.get('/partners/distributors').catch(() => ({ data: [] })),
        api.get('/partners/retailers').catch(() => ({ data: [] }))
      ]);
      setPartners({
        ss: Array.isArray(ssRes.data) ? ssRes.data : ssRes.data.items || [],
        distributors: Array.isArray(distRes.data) ? distRes.data : distRes.data.items || [],
        retailers: Array.isArray(retRes.data) ? retRes.data : retRes.data.items || []
      });
    } catch (err) { console.error(err); }
  };

  // --- CASCADING GEO HANDLER ---
  const handleGeoChange = async (field, value) => {
    setGeoFilter(prev => ({ ...prev, [field]: value }));

    if (field === 'zone_id') {
      setGeoFilter(prev => ({ ...prev, state_id: '', region_id: '', area_id: '', territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/zones/${value}/states`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, states: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'state_id') {
      setGeoFilter(prev => ({ ...prev, region_id: '', area_id: '', territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/states/${value}/regions`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, regions: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'region_id') {
      setGeoFilter(prev => ({ ...prev, area_id: '', territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/regions/${value}/areas`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, areas: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'area_id') {
      setGeoFilter(prev => ({ ...prev, territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, territories: [] }));
      if (value) {
        const res = await api.get(`/geo/areas/${value}/territories`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, territories: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(initialFormState);
    setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });
  };

  const openEditModal = (partner) => {
    setEditingId(partner.id);
    setFormData({
      name: getPartnerName(partner),
      contact_person: getContactPerson(partner) === "Not Provided" ? '' : getContactPerson(partner),
      phone: getPhone(partner),
      email: partner.email || '',
      parent_ss_id: partner.parent_ss_id || '',
      linked_distributor_id: partner.linked_distributor_id || '',
      gstin: partner.gstin || '',
      is_active: partner.is_active !== undefined ? partner.is_active : true
    });

    // Clear the deep lists so user is forced to rebuild hierarchy cleanly if changing
    setGeoMaster(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));
    setGeoFilter({
      zone_id: activeTab === 'ss' ? (partner.zone_id || '') : '',
      state_id: activeTab === 'distributors' ? (partner.state_id || '') : '',
      region_id: '',
      area_id: '',
      territory_id: activeTab === 'retailers' ? (partner.territory_id || '') : ''
    });

    setIsModalOpen(true);
  };

  const buildPayload = () => {
    const payload = { ...formData };

    if (activeTab === 'ss') {
      payload.firm_name = payload.name;
      payload.zone_id = parseInt(geoFilter.zone_id); // Pick from GeoFilter directly
      payload.contact_number = payload.phone;
      delete payload.name;
      delete payload.phone;
      delete payload.parent_ss_id;
      delete payload.linked_distributor_id;

    } else if (activeTab === 'distributors') {
      payload.firm_name = payload.name;
      payload.state_id = parseInt(geoFilter.state_id); // Pick from GeoFilter directly
      payload.contact_number = payload.phone;
      payload.parent_ss_id = payload.parent_ss_id ? parseInt(payload.parent_ss_id) : null;
      payload.is_direct_party = !payload.parent_ss_id;
      delete payload.phone;
      delete payload.name;
      delete payload.linked_distributor_id;

    } else if (activeTab === 'retailers') {
      payload.shop_name = payload.name;
      payload.territory_id = parseInt(geoFilter.territory_id); // Pick from GeoFilter directly
      payload.contact_number = payload.phone;
      payload.linked_distributor_id = payload.linked_distributor_id ? parseInt(payload.linked_distributor_id) : null;
      delete payload.name;
      delete payload.phone;
      delete payload.parent_ss_id;
    }

    return payload;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const endpoint = getEndpoint();
    const payload = buildPayload();

    const toastId = toast.loading(editingId ? `Updating ${activeTab}...` : `Provisioning new ${activeTab}...`);

    try {
      if (editingId) {
        await api.patch(`/partners/${endpoint}/${editingId}`, payload);
        toast.success(`${activeTab.toUpperCase()} updated successfully!`, { id: toastId });
      } else {
        await api.post(`/partners/${endpoint}`, payload);
        toast.success(`${activeTab.toUpperCase()} created successfully!`, { id: toastId });
      }
      handleCloseModal();
      refetchPartners();
    } catch (err) {
      toast.error(`Error saving: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const togglePartnerStatus = async (id, currentStatus) => {
    const endpoint = getEndpoint();
    const toastId = toast.loading('Updating network status...');
    try {
      await api.patch(`/partners/${endpoint}/${id}`, { is_active: !currentStatus });
      toast.success('Status updated', { id: toastId });
      refetchPartners();
    } catch (err) {
      toast.error("Status update failed.", { id: toastId });
    }
  };

  const handleDeletePartner = async (id, rawPartnerData) => {
    const displayName = getPartnerName(rawPartnerData);
    if (!window.confirm(`Critical Action: Are you sure you want to permanently delete ${displayName}? This cannot be undone.`)) return;

    const endpoint = getEndpoint();
    const toastId = toast.loading(`Removing ${displayName}...`);

    try {
      await api.delete(`/partners/${endpoint}/${id}`);
      toast.success(`${displayName} removed from network.`, { id: toastId });
      refetchPartners();
    } catch (err) {
      toast.error("Failed to delete partner.", { id: toastId });
    }
  };

  const activeList = activeTab === 'ss' ? partners.ss : activeTab === 'distributors' ? partners.distributors : partners.retailers;
  const filteredList = activeList.filter(p => {
    const safeName = getPartnerName(p);
    return safeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (p.gstin && p.gstin.toLowerCase().includes(searchQuery.toLowerCase()));
  });


  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-network-wired text-primary me-2"></i> Partner Matrix
          </h3>
          <p className="text-muted m-0 mt-1">Manage and provision your supply chain network nodes.</p>
        </div>
        <button className="btn btn-primary btn-lg shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsModalOpen(true)}>
          <i className="fa-solid fa-plus me-2"></i> Add {activeTab === 'ss' ? 'Super Stockist' : activeTab.slice(0, -1)}
        </button>
      </div>

      {/* METRIC CARDS */}
      <div className="row g-4 mb-5">
        {[
          { title: 'Super Stockists', count: partners.ss.length, icon: 'fa-warehouse', color: 'primary' },
          { title: 'Distributors', count: partners.distributors.length, icon: 'fa-truck-fast', color: 'success' },
          { title: 'Retailers', count: partners.retailers.length, icon: 'fa-store', color: 'warning' }
        ].map((metric, idx) => (
          <div className="col-md-4" key={idx}>
            <div className="card border-0 shadow-sm rounded-4 h-100 overflow-hidden" style={{ transition: 'transform 0.2s' }}>
              <div className="card-body d-flex align-items-center p-4">
                <div className={`bg-${metric.color} bg-opacity-10 text-${metric.color} p-3 rounded-circle me-4 d-flex align-items-center justify-content-center`} style={{ width: '60px', height: '60px' }}>
                  <i className={`fa-solid ${metric.icon} fs-3`}></i>
                </div>
                <div>
                  <h6 className="text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '0.8rem', letterSpacing: '1px' }}>{metric.title}</h6>
                  <h2 className="fw-bolder mb-0 text-dark">{metric.count}</h2>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* TIER NAVIGATION & SEARCH */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-3 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <div className="nav nav-pills p-1 bg-light rounded-pill d-inline-flex w-100 w-md-auto">
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'ss' ? 'active shadow-sm fw-bold bg-primary text-white' : 'text-dark fw-semibold'}`} onClick={() => { setActiveTab('ss'); setSearchQuery(''); }}>
              <i className="fa-solid fa-warehouse me-2"></i> Super Stockists
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'distributors' ? 'active shadow-sm fw-bold bg-success text-white' : 'text-dark fw-semibold'}`} onClick={() => { setActiveTab('distributors'); setSearchQuery(''); }}>
              <i className="fa-solid fa-truck-ramp-box me-2"></i> Distributors
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'retailers' ? 'active shadow-sm fw-bold bg-warning text-dark' : 'text-dark fw-semibold'}`} onClick={() => { setActiveTab('retailers'); setSearchQuery(''); }}>
              <i className="fa-solid fa-shop me-2"></i> Retailers
            </button>
          </div>

          <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '300px' }}>
            <span className="input-group-text bg-white border-0 ps-4"><i className="fa-solid fa-magnifying-glass text-muted"></i></span>
            <input
              type="text"
              className="form-control border-0 bg-white py-2 shadow-none fw-semibold"
              placeholder={`Search ${activeTab} by name or GSTIN...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* PARTNER GRID */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 bg-white">
            <thead className="bg-light">
              <tr>
                <th className="px-4 py-3 text-uppercase text-muted fw-bold border-bottom-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Status</th>
                <th className="py-3 text-uppercase text-muted fw-bold border-bottom-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Entity Details</th>
                <th className="py-3 text-uppercase text-muted fw-bold border-bottom-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Contact</th>
                <th className="py-3 text-uppercase text-muted fw-bold border-bottom-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Geography Level</th>
                <th className="py-3 text-uppercase text-muted fw-bold border-bottom-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>GSTIN</th>
                <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-bottom-0" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-5"><div className="spinner-border text-primary" role="status"></div></td></tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-5 bg-light bg-opacity-50">
                    <div className="text-muted mb-3"><i className="fa-solid fa-box-open fs-1 opacity-25"></i></div>
                    <h5 className="text-muted fw-bold">No Records Found</h5>
                  </td>
                </tr>
              ) : filteredList.map(p => (
                <tr key={p.id} className={!p.is_active ? 'bg-light opacity-75' : ''}>
                  <td className="px-4">
                    <span className={`badge rounded-pill px-3 py-2 ${p.is_active ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                      <i className={`fa-solid ${p.is_active ? 'fa-check-circle' : 'fa-ban'} me-1`}></i> {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td>
                    <div className="fw-bolder text-dark fs-6">{getPartnerName(p)}</div>
                    <small className="text-muted font-monospace opacity-75">UID: #{p.id}</small>
                  </td>
                  <td>
                    <div className="small fw-semibold text-dark mb-1"><i className="fa-regular fa-user text-muted me-2"></i>{getContactPerson(p)}</div>
                    <div className="small text-muted"><i className="fa-solid fa-phone text-muted me-2"></i>{getPhone(p)}</div>
                  </td>
                  <td>
                    <span className="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 rounded-pill px-3 font-monospace">
                      <i className="fa-solid fa-location-dot me-1 text-muted"></i> {getRegionDisplay(p)}
                    </span>
                    {activeTab === 'distributors' && p.parent_ss_id && (
                       <div className="small text-primary mt-1 fw-semibold ms-1"><i className="fa-solid fa-link me-1"></i> SS Assigned</div>
                    )}
                     {activeTab === 'retailers' && p.linked_distributor_id && (
                       <div className="small text-primary mt-1 fw-semibold ms-1"><i className="fa-solid fa-link me-1"></i> Dist Assigned</div>
                    )}
                  </td>
                  <td>{p.gstin ? <code className="text-primary bg-primary bg-opacity-10 px-2 py-1 rounded border border-primary border-opacity-25">{p.gstin}</code> : <span className="text-muted small">-</span>}</td>
                  <td className="text-end px-4" style={{ minWidth: '160px' }}>
                    <button className="btn btn-light btn-sm rounded-circle me-2 text-primary shadow-sm" onClick={() => openEditModal(p)}><i className="fa-solid fa-pen-to-square"></i></button>
                    <button className={`btn btn-light btn-sm rounded-circle me-2 shadow-sm ${p.is_active ? 'text-warning' : 'text-success'}`} onClick={() => togglePartnerStatus(p.id, p.is_active)}><i className={`fa-solid ${p.is_active ? 'fa-pause' : 'fa-play'}`}></i></button>
                    <button className="btn btn-light btn-sm rounded-circle text-danger shadow-sm" onClick={() => handleDeletePartner(p.id, p)}><i className="fa-regular fa-trash-can"></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL --- */}
      {isModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleFormSubmit}>
                <div className={`modal-header bg-gradient text-white border-0 p-4 ${editingId ? 'bg-info' : 'bg-primary'}`}>
                  <h5 className="modal-title fw-bold">
                    <i className={`fa-solid ${editingId ? 'fa-pen-to-square' : 'fa-layer-group'} me-2`}></i>
                    {editingId ? 'Edit' : 'Provision New'} {activeTab === 'ss' ? 'Super Stockist' : activeTab.slice(0, -1)}
                  </h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={handleCloseModal}></button>
                </div>

                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Registered Entity Name <span className="text-danger">*</span></label>
                      <input type="text" className="form-control form-control-lg border-0 shadow-sm rounded-3 fw-semibold" required placeholder="e.g. Acme Logistics" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Primary Contact</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 fw-semibold" placeholder="Full Name" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Phone Number</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 fw-semibold" placeholder="+91..." value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>

                    {/* --- CASCADING GEO DROPDOWNS --- */}
                    <div className="col-12 mt-3 p-3 bg-white rounded-3 border shadow-sm">
                      <label className="form-label fw-bold text-uppercase text-primary mb-2">
                        <i className="fa-solid fa-map-location-dot me-2"></i> Geographical Assignment <span className="text-danger">*</span>
                      </label>

                      {editingId && (
                        <div className="small text-warning fw-semibold mb-3">
                          <i className="fa-solid fa-triangle-exclamation me-1"></i> Note: To update location, re-select from Zone. Current IDs are shown in the main table.
                        </div>
                      )}

                      <div className="row g-2">
                        <div className="col-md-4">
                          <label className="form-label small text-muted fw-bold mb-1">Zone</label>
                          <select className="form-select form-select-sm border shadow-none fw-semibold" required value={geoFilter.zone_id} onChange={e => handleGeoChange('zone_id', e.target.value)}>
                            <option value="">Select Zone</option>
                            {geoMaster.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                          </select>
                        </div>

                        {activeTab !== 'ss' && (
                          <div className="col-md-4">
                            <label className="form-label small text-muted fw-bold mb-1">State</label>
                            <select className="form-select form-select-sm border shadow-none fw-semibold" required value={geoFilter.state_id} onChange={e => handleGeoChange('state_id', e.target.value)} disabled={!geoFilter.zone_id}>
                              <option value="">Select State</option>
                              {geoMaster.states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        )}

                        {activeTab === 'retailers' && (
                          <>
                            <div className="col-md-4">
                              <label className="form-label small text-muted fw-bold mb-1">Region</label>
                              <select className="form-select form-select-sm border shadow-none fw-semibold" required value={geoFilter.region_id} onChange={e => handleGeoChange('region_id', e.target.value)} disabled={!geoFilter.state_id}>
                                <option value="">Select Region</option>
                                {geoMaster.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                            </div>
                            <div className="col-md-6">
                              <label className="form-label small text-muted fw-bold mb-1">Area</label>
                              <select className="form-select form-select-sm border shadow-none fw-semibold" required value={geoFilter.area_id} onChange={e => handleGeoChange('area_id', e.target.value)} disabled={!geoFilter.region_id}>
                                <option value="">Select Area</option>
                                {geoMaster.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                            </div>
                            <div className="col-md-6">
                              <label className="form-label small text-muted fw-bold mb-1">Territory</label>
                              <select className="form-select form-select-sm border border-primary shadow-none fw-semibold text-primary" required value={geoFilter.territory_id} onChange={e => handleGeoChange('territory_id', e.target.value)} disabled={!geoFilter.area_id}>
                                <option value="">Select Territory</option>
                                {geoMaster.territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* DISTRIBUTOR SPECIFIC - PARENT SUPER STOCKIST MAPPING */}
                    {activeTab === 'distributors' && (
                      <div className="col-md-6 mt-3">
                        <label className="form-label small fw-bold text-uppercase text-muted mb-1">Parent Super Stockist <span className="text-muted fw-normal text-transform-none">(Optional)</span></label>
                        <select
                          className="form-select border-0 shadow-sm rounded-3 py-2 fw-semibold"
                          value={formData.parent_ss_id}
                          onChange={e => setFormData({...formData, parent_ss_id: e.target.value})}
                        >
                          <option value="">None (Direct Factory Party)</option>
                          {partners.ss.map(ss => (
                            <option key={ss.id} value={ss.id}>{ss.firm_name || ss.name} (ID: {ss.id})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* RETAILER SPECIFIC - ASSIGNED DISTRIBUTOR */}
                    {activeTab === 'retailers' && (
                      <div className="col-md-6 mt-3">
                        <label className="form-label small fw-bold text-uppercase text-muted mb-1">
                          Assigned Distributor <span className="text-muted fw-normal text-transform-none">(Optional)</span>
                        </label>
                        <select
                          className="form-select border-0 shadow-sm rounded-3 py-2 fw-semibold"
                          value={formData.linked_distributor_id}
                          onChange={e => setFormData({...formData, linked_distributor_id: e.target.value})}
                        >
                          <option value="">Open Market (Any in State)</option>
                          {partners.distributors.map(d => (
                            <option key={d.id} value={d.id}>{d.firm_name || d.name} (ID: {d.id})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="col-md-6 mt-3">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">GSTIN</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 text-uppercase fw-semibold" placeholder="22AAAAA0000A1Z5" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} />
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={handleCloseModal}>Cancel</button>
                  <button type="submit" className={`btn fw-semibold px-5 rounded-pill shadow-sm ${editingId ? 'btn-info text-white' : 'btn-primary'}`}>
                    <i className="fa-solid fa-cloud-arrow-up me-2"></i> {editingId ? 'Save Changes' : 'Initialize Node'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}