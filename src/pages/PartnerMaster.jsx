import React, { useState, useEffect } from 'react';
import api from '../api';

export default function ProductMaster() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

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
      // Adjust prefix if your main.py router prefix is different (e.g., /products)
      const res = await api.get('/product/');
      setProducts(res.data);
    } catch (err) {
      setError('Failed to fetch Product Master data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingId) {
        // Update existing
        await api.patch(`/product/${editingId}`, formData);
      } else {
        // Create new
        await api.post('/product/', formData);
      }
      setIsModalOpen(false);
      resetForm();
      fetchProducts(); // Refresh grid
    } catch (err) {
      alert("Error saving product: " + (err.response?.data?.detail || err.message));
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to disable SKU: ${name}?`)) {
      try {
        await api.delete(`/product/${id}`);
        fetchProducts(); // Refresh grid
      } catch (err) {
        alert("Error deleting product.");
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
    <div className="container-fluid p-4 position-relative">

      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold m-0"><i className="fa-solid fa-box-open text-primary me-2"></i> Product Master Vault</h4>
          <small className="text-muted">Manage SKUs, Pricing Tiers, and Category Taxonomy</small>
        </div>
        <button onClick={openNewModal} className="btn btn-primary fw-bold shadow-sm">
          <i className="fa-solid fa-plus me-2"></i> Provision New SKU
        </button>
      </div>

      {/* KPIs ROW */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-primary h-100">
            <div className="card-body p-3">
              <div className="text-muted small fw-bold text-uppercase mb-1">Total Active SKUs</div>
              <div className="fs-3 fw-bold text-dark">{activeCount}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-info h-100">
            <div className="card-body p-3">
              <div className="text-muted small fw-bold text-uppercase mb-1">Product Categories</div>
              <div className="fs-3 fw-bold text-dark">{categories.length}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-success h-100">
            <div className="card-body p-3">
              <div className="text-muted small fw-bold text-uppercase mb-1">Avg Base Margin</div>
              <div className="fs-3 fw-bold text-dark">
                {products.length ?
                  (products.reduce((acc, p) => acc + ((p.mrp - p.base_price)/p.mrp)*100, 0) / products.length).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-warning h-100">
            <div className="card-body p-3">
              <div className="text-muted small fw-bold text-uppercase mb-1">Disabled Items</div>
              <div className="fs-3 fw-bold text-dark">{products.length - activeCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* DATA GRID */}
      <div className="card border-0 shadow-sm rounded-4">
        <div className="card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
          <h6 className="m-0 fw-bold"><i className="fa-solid fa-table-list text-muted me-2"></i> SKU Ledger</h6>
          <div className="input-group" style={{ width: '300px' }}>
            <span className="input-group-text bg-light border-end-0"><i className="fa-solid fa-search text-muted"></i></span>
            <input
              type="text"
              className="form-control bg-light border-start-0"
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
            <div className="p-5 text-center text-danger"><i className="fa-solid fa-triangle-exclamation me-2"></i>{error}</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light text-muted small text-uppercase">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th>SKU Code</th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th className="text-end">Base Price (₹)</th>
                    <th className="text-end">MRP (₹)</th>
                    <th className="text-center">Margin</th>
                    <th className="text-center">Case Size</th>
                    <th className="text-end px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => {
                    const marginValue = (((p.mrp - p.base_price) / p.mrp) * 100).toFixed(1);
                    return (
                      <tr key={p.id} className={!p.is_active ? 'opacity-50' : ''}>
                        <td className="px-4">
                          <span className={`badge ${p.is_active ? 'bg-success bg-opacity-10 text-success border border-success' : 'bg-secondary bg-opacity-10 text-secondary border'}`}>
                            {p.is_active ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </td>
                        <td className="fw-bold font-monospace text-primary">{p.sku_code}</td>
                        <td className="fw-medium">{p.name}</td>
                        <td><span className="badge bg-light text-dark border">{p.category || 'Uncategorized'}</span></td>
                        <td className="text-end fw-medium text-danger">₹{parseFloat(p.base_price).toFixed(2)}</td>
                        <td className="text-end fw-bold text-success">₹{parseFloat(p.mrp).toFixed(2)}</td>
                        <td className="text-center">
                          <span className={`badge ${marginValue > 40 ? 'bg-success' : marginValue > 20 ? 'bg-warning text-dark' : 'bg-danger'}`}>
                            {marginValue}%
                          </span>
                        </td>
                        <td className="text-center text-muted small">{p.units_per_case} UOM</td>
                        <td className="text-end px-4">
                          <div className="btn-group">
                            <button onClick={() => openEditModal(p)} className="btn btn-sm btn-outline-primary"><i className="fa-solid fa-pen-to-square"></i></button>
                            {p.is_active && (
                              <button onClick={() => handleDelete(p.id, p.name)} className="btn btn-sm btn-outline-danger"><i className="fa-solid fa-trash"></i></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr><td colSpan="9" className="text-center py-5 text-muted">No products found matching your criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY MODAL FOR CREATE/EDIT */}
      {isModalOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 1050 }}>
          <div className="card border-0 shadow-lg rounded-4" style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-header bg-dark text-white p-4 border-0 d-flex justify-content-between align-items-center">
              <h5 className="m-0 fw-bold">{editingId ? 'Modify Product Specifications' : 'Provision New Product SKU'}</h5>
              <button type="button" className="btn-close btn-close-white" onClick={() => setIsModalOpen(false)}></button>
            </div>
            <div className="card-body p-4">
              <form onSubmit={handleSave}>
                <div className="row g-3">

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">SKU Code (Unique ID) *</label>
                    <input type="text" className="form-control font-monospace text-primary fw-bold" value={formData.sku_code} onChange={e => setFormData({...formData, sku_code: e.target.value.toUpperCase()})} required disabled={editingId} />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Product Category</label>
                    <input type="text" className="form-control" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="e.g., Beverages, Snacks..." />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-bold text-muted">Full Product Name *</label>
                    <input type="text" className="form-control" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-bold text-muted">Description</label>
                    <textarea className="form-control" rows="2" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                  </div>

                  <div className="col-12"><hr className="text-muted"/></div>
                  <h6 className="fw-bold text-dark mb-0"><i className="fa-solid fa-indian-rupee-sign text-success me-2"></i> Financial & Packaging Specs</h6>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Base Price (Factory Cost) *</label>
                    <div className="input-group">
                      <span className="input-group-text">₹</span>
                      <input type="number" step="0.01" className="form-control text-danger fw-bold" value={formData.base_price} onChange={e => setFormData({...formData, base_price: e.target.value})} required />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Maximum Retail Price (MRP) *</label>
                    <div className="input-group">
                      <span className="input-group-text">₹</span>
                      <input type="number" step="0.01" className="form-control text-success fw-bold" value={formData.mrp} onChange={e => setFormData({...formData, mrp: e.target.value})} required />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Applicable GST (%)</label>
                    <select className="form-select" value={formData.gst_percent} onChange={e => setFormData({...formData, gst_percent: parseInt(e.target.value)})}>
                      <option value={0}>0% (Exempt)</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Units Per Case (UOM)</label>
                    <div className="input-group">
                      <input type="number" className="form-control" value={formData.units_per_case} onChange={e => setFormData({...formData, units_per_case: parseInt(e.target.value)})} min="1" required />
                      <span className="input-group-text">Units</span>
                    </div>
                  </div>

                  {editingId && (
                    <div className="col-12 mt-3">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="isActiveSwitch" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
                        <label className="form-check-label fw-bold" htmlFor="isActiveSwitch">Product is Active in System</label>
                      </div>
                    </div>
                  )}

                </div>

                <div className="d-flex justify-content-end mt-4 pt-3 border-top">
                  <button type="button" className="btn btn-light border me-2" onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary fw-bold" disabled={formLoading}>
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