import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function ProductMaster() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // --- BULLETPROOF RBAC LOGIC ---
  const { user } = useAuth();
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const userPerms = user?.permissions || [];

  // Admins bypass all UI locks automatically
  const isAdmin = roleName?.toLowerCase() === 'admin' || userPerms.includes('manage_roles');

  // The specific check to reveal create/edit buttons
  const canManageProducts = isAdmin || userPerms.includes('manage_products');

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    sku_code: '',
    name: '',
    category: '',
    description: '',
    mrp: '',
    base_price: '',
    gst_percent: 18,
    units_per_case: 1,
    is_active: true
  });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  // --- API CALLS ---
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products/');
      setProducts(res.data);
    } catch (err) {
      setError('Failed to fetch Product Master data.');
      toast.error('Failed to load product data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    const toastId = toast.loading(editingId ? 'Updating SKU specifications...' : 'Provisioning new SKU...');

    try {
      if (editingId) {
        await api.patch(`/products/${editingId}`, formData);
        toast.success('SKU updated successfully!', { id: toastId });
      } else {
        await api.post('/products/', formData);
        toast.success('New SKU provisioned successfully!', { id: toastId });
      }
      setIsModalOpen(false);
      resetForm();
      fetchProducts();
    } catch (err) {
      toast.error(`Transaction Failed: ${err.response?.data?.detail || err.message}`, { id: toastId });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to disable SKU: ${name}?`)) {
      const toastId = toast.loading(`Disabling ${name}...`);
      try {
        await api.delete(`/products/${id}`);
        toast.success('SKU disabled successfully.', { id: toastId });
        fetchProducts();
      } catch (err) {
        toast.error(`Failed to disable SKU: ${err.response?.data?.detail || err.message}`, { id: toastId });
      }
    }
  };

  // --- UI HANDLERS ---
  const openNewModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingId(product.id);
    setFormData({
      sku_code: product.sku_code,
      name: product.name,
      category: product.category || '',
      description: product.description || '',
      mrp: product.mrp,
      base_price: product.base_price,
      gst_percent: product.gst_percent,
      units_per_case: product.units_per_case,
      is_active: product.is_active
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      sku_code: '', name: '', category: '', description: '',
      mrp: '', base_price: '', gst_percent: 18, units_per_case: 1, is_active: true
    });
  };

  // --- CALCULATIONS & FILTERING ---
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeCount = products.filter(p => p.is_active).length;
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-box-open text-primary me-2"></i> Product Master Vault
          </h3>
          <p className="text-muted m-0 mt-1">Manage SKUs, Pricing Tiers, and Category Taxonomy.</p>
        </div>

        {/* SECURED ADD BUTTON */}
        {canManageProducts && (
          <button onClick={openNewModal} className="btn btn-primary btn-lg rounded-pill fw-bold shadow-sm px-4">
            <i className="fa-solid fa-plus me-2"></i> Provision New SKU
          </button>
        )}
      </div>

      {/* KPIs ROW */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-primary h-100">
            <div className="card-body p-4">
              <div className="text-muted small fw-bold text-uppercase mb-2">Total Active SKUs</div>
              <div className="fs-2 fw-bolder text-dark">{activeCount}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-info h-100">
            <div className="card-body p-4">
              <div className="text-muted small fw-bold text-uppercase mb-2">Product Categories</div>
              <div className="fs-2 fw-bolder text-dark">{categories.length}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-success h-100">
            <div className="card-body p-4">
              <div className="text-muted small fw-bold text-uppercase mb-2">Avg Base Margin</div>
              <div className="fs-2 fw-bolder text-dark">
                {products.length ?
                  (products.reduce((acc, p) => acc + ((p.mrp - p.base_price)/p.mrp)*100, 0) / products.length).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-warning h-100">
            <div className="card-body p-4">
              <div className="text-muted small fw-bold text-uppercase mb-2">Disabled Items</div>
              <div className="fs-2 fw-bolder text-dark">{products.length - activeCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* DATA GRID */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        <div className="card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
          <h6 className="m-0 fw-bold"><i className="fa-solid fa-table-list text-muted me-2"></i> SKU Ledger</h6>
          <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '300px' }}>
            <span className="input-group-text bg-light border-0 ps-4"><i className="fa-solid fa-magnifying-glass text-muted"></i></span>
            <input
              type="text"
              className="form-control border-0 bg-light py-2 shadow-none fw-semibold"
              placeholder="Search by SKU, Name, Category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="card-body p-0">
          {loading ? (
            <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div>
          ) : error ? (
            <div className="p-5 text-center text-danger"><i className="fa-solid fa-triangle-exclamation me-2 fs-1 mb-3 d-block opacity-50"></i><h5 className="fw-bold">{error}</h5></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="bg-light text-muted small text-uppercase">
                  <tr>
                    <th className="px-4 py-3 fw-bold border-0">Status</th>
                    <th className="py-3 fw-bold border-0">SKU Code</th>
                    <th className="py-3 fw-bold border-0">Product Name</th>
                    <th className="py-3 fw-bold border-0">Category</th>
                    <th className="text-end py-3 fw-bold border-0">Base Price (₹)</th>
                    <th className="text-end py-3 fw-bold border-0">MRP (₹)</th>
                    <th className="text-center py-3 fw-bold border-0">Margin</th>
                    <th className="text-center py-3 fw-bold border-0">Case Size</th>
                    {/* SECURED HEADER */}
                    {canManageProducts && <th className="text-end px-4 py-3 fw-bold border-0">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => {
                    const marginValue = (((p.mrp - p.base_price) / p.mrp) * 100).toFixed(1);
                    return (
                      <tr key={p.id} className={!p.is_active ? 'opacity-50 bg-light' : ''}>
                        <td className="px-4">
                          <span className={`badge rounded-pill px-3 py-2 ${p.is_active ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-25' : 'bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25'}`}>
                            <i className={`fa-solid ${p.is_active ? 'fa-check' : 'fa-ban'} me-1`}></i> {p.is_active ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </td>
                        <td><code className="bg-primary bg-opacity-10 text-primary px-2 py-1 rounded fw-bolder border border-primary border-opacity-25">{p.sku_code}</code></td>
                        <td className="fw-bolder text-dark">{p.name}</td>
                        <td><span className="badge bg-light text-dark border px-3 py-2">{p.category || 'Uncategorized'}</span></td>
                        <td className="text-end fw-bold text-danger">₹{parseFloat(p.base_price).toFixed(2)}</td>
                        <td className="text-end fw-bolder text-success fs-6">₹{parseFloat(p.mrp).toFixed(2)}</td>
                        <td className="text-center">
                          <span className={`badge rounded-pill px-3 py-1 shadow-sm ${marginValue > 40 ? 'bg-success' : marginValue > 20 ? 'bg-warning text-dark' : 'bg-danger'}`}>
                            {marginValue}%
                          </span>
                        </td>
                        <td className="text-center text-muted fw-semibold small">{p.units_per_case} UOM</td>

                        {/* SECURED TABLE ACTIONS */}
                        {canManageProducts && (
                          <td className="text-end px-4" style={{ minWidth: '120px' }}>
                              <button onClick={() => openEditModal(p)} className="btn btn-light btn-sm rounded-circle me-2 text-primary shadow-sm border"><i className="fa-solid fa-pen-to-square"></i></button>
                              {p.is_active && (
                                <button onClick={() => handleDelete(p.id, p.name)} className="btn btn-light btn-sm rounded-circle text-danger shadow-sm border"><i className="fa-solid fa-trash"></i></button>
                              )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr><td colSpan={canManageProducts ? "9" : "8"} className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-box-open fs-1 opacity-25 d-block mb-3"></i>No products found matching your criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY MODAL FOR CREATE/EDIT (SECURED) */}
      {isModalOpen && canManageProducts && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 1050, backdropFilter: 'blur(5px)' }}>
          <div className="card border-0 shadow-lg rounded-4 overflow-hidden" style={{ width: '600px', maxHeight: '90vh' }}>
            <div className="card-header bg-dark bg-gradient text-white p-4 border-0 d-flex justify-content-between align-items-center">
              <h5 className="m-0 fw-bold"><i className={`fa-solid ${editingId ? 'fa-pen-to-square text-info' : 'fa-box-open text-success'} me-2`}></i> {editingId ? 'Modify Product Specifications' : 'Provision New Product SKU'}</h5>
              <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsModalOpen(false)}></button>
            </div>

            <div className="card-body p-0 custom-scrollbar" style={{ overflowY: 'auto' }}>
              <form onSubmit={handleSave} className="p-4">
                <div className="row g-4">

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">SKU Code (Unique ID) <span className="text-danger">*</span></label>
                    <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 font-monospace text-primary fw-bold" value={formData.sku_code} onChange={e => setFormData({...formData, sku_code: e.target.value.toUpperCase()})} required disabled={editingId} placeholder="e.g. BEV-001" />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Product Category</label>
                    <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 fw-semibold" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="e.g., Beverages, Snacks..." />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Full Product Name <span className="text-danger">*</span></label>
                    <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 fw-bold text-dark fs-5" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required placeholder="Enter formal product title..." />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Description</label>
                    <textarea className="form-control border-0 shadow-sm rounded-3 p-3" rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Internal notes or variant details..."></textarea>
                  </div>

                  <div className="col-12 mt-4">
                     <div className="p-3 bg-light rounded-4 border shadow-sm">
                        <h6 className="fw-bold text-dark mb-3"><i className="fa-solid fa-indian-rupee-sign text-success me-2"></i> Financial & Packaging Specs</h6>
                        <div className="row g-3">

                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-uppercase text-muted mb-1">Base Price (Factory Cost) <span className="text-danger">*</span></label>
                            <div className="input-group shadow-sm rounded-3 overflow-hidden">
                              <span className="input-group-text bg-white border-0 text-muted">₹</span>
                              <input type="number" step="0.01" className="form-control border-0 bg-white shadow-none text-danger fw-bold fs-5 px-1" value={formData.base_price} onChange={e => setFormData({...formData, base_price: e.target.value})} required placeholder="0.00" />
                            </div>
                          </div>

                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-uppercase text-muted mb-1">Max Retail Price (MRP) <span className="text-danger">*</span></label>
                            <div className="input-group shadow-sm rounded-3 overflow-hidden">
                              <span className="input-group-text bg-white border-0 text-muted">₹</span>
                              <input type="number" step="0.01" className="form-control border-0 bg-white shadow-none text-success fw-bolder fs-4 px-1" value={formData.mrp} onChange={e => setFormData({...formData, mrp: e.target.value})} required placeholder="0.00" />
                            </div>
                          </div>

                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-uppercase text-muted mb-1">Applicable GST (%)</label>
                            <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-semibold" value={formData.gst_percent} onChange={e => setFormData({...formData, gst_percent: parseInt(e.target.value)})}>
                              <option value={0}>0% (Exempt)</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
                          </div>

                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-uppercase text-muted mb-1">Units Per Case (UOM)</label>
                            <div className="input-group shadow-sm rounded-3 overflow-hidden">
                              <input type="number" className="form-control border-0 bg-white shadow-none py-2 fw-bold" value={formData.units_per_case} onChange={e => setFormData({...formData, units_per_case: parseInt(e.target.value)})} min="1" required />
                              <span className="input-group-text bg-white border-0 text-muted small fw-bold text-uppercase">Units</span>
                            </div>
                          </div>
                        </div>
                     </div>
                  </div>

                  {editingId && (
                    <div className="col-12 mt-3">
                      <div className="form-check form-switch bg-white p-3 rounded-pill shadow-sm border d-inline-block px-5">
                        <input className="form-check-input ms-0 me-3" type="checkbox" id="isActiveSwitch" style={{width: '40px', height: '20px'}} checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
                        <label className="form-check-label fw-bold text-dark" htmlFor="isActiveSwitch" style={{paddingTop: '2px'}}>System Status: <span className={formData.is_active ? 'text-success' : 'text-danger'}>{formData.is_active ? 'ACTIVE' : 'DISABLED'}</span></label>
                      </div>
                    </div>
                  )}

                </div>

                <div className="d-flex justify-content-end mt-4 pt-4 border-top">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill shadow-sm me-3" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary fw-bold px-5 rounded-pill shadow-sm bg-gradient" disabled={formLoading}>
                    {formLoading ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="fa-solid fa-floppy-disk me-2"></i>}
                    {editingId ? 'Update Configurations' : 'Commit to Database'}
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