import React, { useState, useEffect } from 'react';
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

  const isAdmin = roleName?.toLowerCase() === 'admin' || userPerms.includes('manage_roles');
  const canManageProducts = isAdmin || userPerms.includes('manage_products');

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    sku_code: '',
    name: '',
    category: '',
    description: '',
    item_type: 'FG',
    uom: 'BOXES',     // Default to BOXES for FG
    mrp: '',
    base_price: '',
    gst_percent: 18,
    // 📦 NEW PACKAGING LOGIC STATE
    blades_per_tuck: 5,
    blades_per_box: 10000,
    is_active: true
  });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

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
    const toastId = toast.loading(editingId ? 'Updating specifications...' : 'Provisioning new item...');

    try {
      const submissionData = { ...formData };

      // If it's a Raw Material, clean up FG specific fields
      if (submissionData.item_type === 'RM' || submissionData.item_type === 'WIP') {
        submissionData.mrp = 0;
        submissionData.blades_per_tuck = null;
        submissionData.blades_per_box = null;
      }

      if (editingId) {
        await api.patch(`/products/${editingId}`, submissionData);
        toast.success('Item updated successfully!', { id: toastId });
      } else {
        await api.post('/products/', submissionData);
        toast.success('New item provisioned successfully!', { id: toastId });
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
    if (window.confirm(`Are you sure you want to disable item: ${name}?`)) {
      const toastId = toast.loading(`Disabling ${name}...`);
      try {
        await api.delete(`/products/${id}`);
        toast.success('Item disabled successfully.', { id: toastId });
        fetchProducts();
      } catch (err) {
        toast.error(`Failed to disable: ${err.response?.data?.detail || err.message}`, { id: toastId });
      }
    }
  };

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
      item_type: product.item_type || 'FG',
      uom: product.uom || 'BOXES',
      mrp: product.mrp,
      base_price: product.base_price,
      gst_percent: product.gst_percent,
      blades_per_tuck: product.blades_per_tuck || 5,
      blades_per_box: product.blades_per_box || 10000,
      is_active: product.is_active
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      sku_code: '', name: '', category: '', description: '',
      item_type: 'FG', uom: 'BOXES', mrp: '', base_price: '', gst_percent: 18,
      blades_per_tuck: 5, blades_per_box: 10000, is_active: true
    });
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.item_type && p.item_type.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeCount = products.filter(p => p.is_active).length;
  const rmCount = products.filter(p => p.item_type === 'RM').length;

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bolder m-0 text-dark"><i className="fa-solid fa-box-open text-primary me-2"></i> Product & Material Vault</h3>
          <p className="text-muted m-0 mt-1">Manage Finished Goods, Raw Materials, and Pricing Tiers.</p>
        </div>

        {canManageProducts && (
          <button onClick={openNewModal} className="btn btn-primary btn-lg rounded-pill fw-bold shadow-sm px-4">
            <i className="fa-solid fa-plus me-2"></i> Provision New Item
          </button>
        )}
      </div>

      {/* KPIs ROW */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-primary h-100">
            <div className="card-body p-4">
              <div className="text-muted small fw-bold text-uppercase mb-2">Total Items in Vault</div>
              <div className="fs-2 fw-bolder text-dark">{products.length}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-info h-100">
            <div className="card-body p-4">
              <div className="text-muted small fw-bold text-uppercase mb-2">Raw Materials Tracked</div>
              <div className="fs-2 fw-bolder text-dark">{rmCount}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm rounded-4 border-start border-4 border-success h-100">
            <div className="card-body p-4">
              <div className="text-muted small fw-bold text-uppercase mb-2">Avg Base Margin (FG)</div>
              <div className="fs-2 fw-bolder text-dark">
                {products.filter(p => p.item_type === 'FG').length ?
                  (products.filter(p => p.item_type === 'FG').reduce((acc, p) => acc + ((p.mrp - p.base_price)/p.mrp)*100, 0) / products.filter(p => p.item_type === 'FG').length).toFixed(1)
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
          <h6 className="m-0 fw-bold"><i className="fa-solid fa-table-list text-muted me-2"></i> Item Ledger</h6>
          <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '300px' }}>
            <span className="input-group-text bg-light border-0 ps-4"><i className="fa-solid fa-magnifying-glass text-muted"></i></span>
            <input type="text" className="form-control border-0 bg-light py-2 shadow-none fw-semibold" placeholder="Search by SKU, Name, Type..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>

        <div className="card-body p-0">
          {loading ? (
            <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div>
          ) : error ? (
            <div className="p-5 text-center text-danger"><h5>{error}</h5></div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="bg-light text-muted small text-uppercase">
                  <tr>
                    <th className="px-4 py-3 border-0">Class</th>
                    <th className="py-3 border-0">SKU Code</th>
                    <th className="py-3 border-0">Product Name</th>
                    <th className="text-center py-3 border-0">Pack Format</th>
                    <th className="text-end py-3 border-0">Base (₹)</th>
                    <th className="text-end py-3 border-0">MRP (₹)</th>
                    {canManageProducts && <th className="text-end px-4 py-3 border-0">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => {
                    return (
                      <tr key={p.id} className={!p.is_active ? 'opacity-50 bg-light' : ''}>
                        <td className="px-4">
                          <span className={`badge rounded-pill px-3 py-1 ${p.item_type === 'RM' ? 'bg-secondary' : p.item_type === 'WIP' ? 'bg-warning text-dark' : 'bg-primary'}`}>
                            {p.item_type || 'FG'}
                          </span>
                        </td>
                        <td><code className="bg-light text-dark px-2 py-1 rounded fw-bolder border">{p.sku_code}</code></td>
                        <td className="fw-bolder text-dark">{p.name}</td>
                        <td className="text-center">
                            {p.item_type === 'FG' ? (
                                <div className="small fw-bold">
                                    <span className="text-primary">{p.tucks_per_box || '-'} Tucks</span> <br/>
                                    <span className="text-muted" style={{fontSize: '0.7rem'}}>({p.box_type || 'Standard'})</span>
                                </div>
                            ) : (
                                <span className="text-muted small fw-semibold">{p.uom || 'KG'}</span>
                            )}
                        </td>
                        <td className="text-end fw-bold text-danger">₹{parseFloat(p.base_price).toFixed(2)}</td>
                        <td className="text-end fw-bolder text-success fs-6">{p.item_type === 'RM' ? '-' : `₹${parseFloat(p.mrp).toFixed(2)}`}</td>
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
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY MODAL */}
      {isModalOpen && canManageProducts && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', zIndex: 1050, backdropFilter: 'blur(5px)' }}>
          <div className="card border-0 shadow-lg rounded-4 overflow-hidden" style={{ width: '700px', maxHeight: '90vh' }}>
            <div className="card-header bg-dark bg-gradient text-white p-4 border-0 d-flex justify-content-between align-items-center">
              <h5 className="m-0 fw-bold">{editingId ? 'Modify Item Specifications' : 'Provision New Inventory Item'}</h5>
              <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsModalOpen(false)}></button>
            </div>

            <div className="card-body p-0 custom-scrollbar" style={{ overflowY: 'auto' }}>
              <form onSubmit={handleSave} className="p-4">
                <div className="row g-4">

                  {/* DYNAMIC ITEM TYPE CLASSIFICATION */}
                  <div className="col-12">
                     <div className="p-3 bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-4 d-flex gap-3">
                        <label className="form-check p-3 bg-white rounded-3 shadow-sm border flex-grow-1" style={{cursor: 'pointer'}}>
                           <input className="form-check-input" type="radio" checked={formData.item_type === 'FG'} onChange={() => setFormData({...formData, item_type: 'FG', uom: 'BOXES'})} />
                           <span className="ms-2 fw-bold text-dark d-block">Finished Good (FG)</span>
                        </label>
                        <label className="form-check p-3 bg-white rounded-3 shadow-sm border flex-grow-1" style={{cursor: 'pointer'}}>
                           <input className="form-check-input" type="radio" checked={formData.item_type === 'RM'} onChange={() => setFormData({...formData, item_type: 'RM', uom: 'KG', mrp: 0})} />
                           <span className="ms-2 fw-bold text-dark d-block">Raw Material (RM)</span>
                        </label>
                     </div>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">SKU Code <span className="text-danger">*</span></label>
                    <input type="text" className="form-control py-2 font-monospace fw-bold" value={formData.sku_code} onChange={e => setFormData({...formData, sku_code: e.target.value.toUpperCase()})} required disabled={editingId} />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Unit of Measure (UOM) <span className="text-danger">*</span></label>
                    <select className="form-select py-2 fw-semibold" value={formData.uom} onChange={e => setFormData({...formData, uom: e.target.value})}>
                      <option value="BOXES">Boxes / Master Cartons</option>
                      <option value="KG">Kilograms (KG)</option>
                      <option value="NOS">Numbers (NOS)</option>
                      <option value="LTR">Liters (LTR)</option>
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-bold text-muted">Product Name <span className="text-danger">*</span></label>
                    <input type="text" className="form-control py-2 fw-bold text-dark fs-5" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>

                  {/* 📦 THE NEW PACKAGING HIERARCHY LOGIC */}
                  {formData.item_type === 'FG' && (
                      <div className="col-12 mt-4">
                         <div className="p-3 bg-warning bg-opacity-10 rounded-4 border border-warning border-opacity-50 shadow-sm">
                            <h6 className="fw-bold text-dark mb-3"><i className="fa-solid fa-box text-warning me-2"></i> Packaging Hierarchy (Tucks & Boxes)</h6>
                            <div className="row g-3">

                              <div className="col-md-6">
                                <label className="form-label small fw-bold text-muted">Blades Per Tuck</label>
                                <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-bold text-primary" value={formData.blades_per_tuck} onChange={e => setFormData({...formData, blades_per_tuck: parseInt(e.target.value)})}>
                                  <option value={5}>5 Blades (Standard)</option>
                                  <option value={6}>6 Blades</option>
                                  <option value={10}>10 Blades</option>
                                  <option value={12}>12 Blades (10+2 Saloon Pack)</option>
                                </select>
                              </div>

                              <div className="col-md-6">
                                <label className="form-label small fw-bold text-muted">Blades Per Master Box</label>
                                <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-bold text-dark" value={formData.blades_per_box} onChange={e => setFormData({...formData, blades_per_box: parseInt(e.target.value)})}>
                                  <option value={10000}>10,000 Blades (Standard Box)</option>
                                  <option value={12000}>12,000 Blades (Saloon Box)</option>
                                </select>
                              </div>

                              <div className="col-12">
                                 <div className="bg-white p-2 rounded-3 border text-center small fw-semibold text-muted shadow-sm mt-2">
                                     <i className="fa-solid fa-calculator me-2"></i>
                                     System will auto-calculate: <span className="text-success fw-bold fs-6">{(formData.blades_per_box / formData.blades_per_tuck).toLocaleString()}</span> Tucks per Box.
                                 </div>
                              </div>
                            </div>
                         </div>
                      </div>
                  )}

                  <div className="col-12 mt-4">
                     <div className="p-3 bg-light rounded-4 border shadow-sm">
                        <h6 className="fw-bold text-dark mb-3"><i className="fa-solid fa-indian-rupee-sign text-success me-2"></i> Financial Specs</h6>
                        <div className="row g-3">

                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">{formData.item_type === 'RM' ? 'Procurement Cost / Unit' : 'Base Factory Cost'} <span className="text-danger">*</span></label>
                            <input type="number" step="0.01" className="form-control text-danger fw-bold" value={formData.base_price} onChange={e => setFormData({...formData, base_price: e.target.value})} required />
                          </div>

                          {formData.item_type === 'FG' && (
                            <div className="col-md-6">
                              <label className="form-label small fw-bold text-muted">Max Retail Price (MRP) <span className="text-danger">*</span></label>
                              <input type="number" step="0.01" className="form-control text-success fw-bolder" value={formData.mrp} onChange={e => setFormData({...formData, mrp: e.target.value})} required />
                            </div>
                          )}

                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">Applicable GST (%)</label>
                            <select className="form-select fw-semibold" value={formData.gst_percent} onChange={e => setFormData({...formData, gst_percent: parseInt(e.target.value)})}>
                              <option value={0}>0% (Exempt)</option>
                              <option value={5}>5%</option>
                              <option value={12}>12%</option>
                              <option value={18}>18%</option>
                              <option value={28}>28%</option>
                            </select>
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
                    {formLoading ? 'Saving...' : editingId ? 'Update Configurations' : 'Commit to Database'}
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