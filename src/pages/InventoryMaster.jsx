import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

export default function InventoryMaster() {
  const [activeTab, setActiveTab] = useState('factory'); // 'factory', 'ss', 'ledger'
  const [loading, setLoading] = useState(false);

  // --- MASTER DATA (For Dropdowns & Name Resolution) ---
  const [masterData, setMasterData] = useState({
    products: [],
    ss: [],
    distributors: [],
    retailers: []
  });

  // --- CORE DATA STATES ---
  const [factoryStock, setFactoryStock] = useState([]);
  const [ssStock, setSsStock] = useState([]);
  const [ledger, setLedger] = useState([]);

  const [targetId, setTargetId] = useState('1'); // Default factory ID to 1

  // --- MODAL STATES ---
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  const [produceForm, setProduceForm] = useState({ product_id: '', quantity: '' });
  const [adjustForm, setAdjustForm] = useState({ entity_type: 'factory', entity_id: '1', product_id: '', quantity: '', reason: '' });

  // --- 1. FETCH MASTER DATA ON MOUNT ---
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [prodRes, ssRes, distRes, retRes] = await Promise.all([
          api.get('/products').catch(() => ({ data: [] })), // Graceful fallback if endpoints differ
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] }))
        ]);

        setMasterData({
          products: Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.items || [],
          ss: Array.isArray(ssRes.data) ? ssRes.data : ssRes.data?.items || [],
          distributors: Array.isArray(distRes.data) ? distRes.data : distRes.data?.items || [],
          retailers: Array.isArray(retRes.data) ? retRes.data : retRes.data?.items || []
        });
      } catch (err) {
        console.error("Master data hydration failed", err);
      }
    };
    fetchMasterData();
    // Auto-load factory 1 stock on mount
    fetchFactoryStock('1');
  }, []);

  // --- HELPERS: RESOLVE IDs TO NAMES ---
  const getProductName = (id) => {
    const p = masterData.products.find(x => x.id === parseInt(id));
    return p ? p.name || p.product_name : `Unknown Product (${id})`;
  };

  const getPartnerName = (type, id) => {
    if (type === 'factory') return `Main Factory (${id})`;

    let list = [];
    if (type === 'ss' || type === 'super_stockist') list = masterData.ss;
    if (type === 'distributor') list = masterData.distributors;
    if (type === 'retailer') list = masterData.retailers;

    const partner = list.find(x => x.id === parseInt(id));
    if (!partner) return `Unknown ${type} (${id})`;

    // Safely check what field the backend used for the name
    return partner.name || partner.firm_name || partner.shop_name || `Partner ${id}`;
  };

  // --- API CALLS ---
  const fetchFactoryStock = async (idToFetch = targetId) => {
    if (!idToFetch) return;
    setLoading(true);
    try {
      const res = await api.get(`/inventory/factory/${idToFetch}`);
      setFactoryStock(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) {
      toast.error("Failed to load Factory stock.");
      setFactoryStock([]);
    } finally { setLoading(false); }
  };

  const fetchSsStock = async (idToFetch) => {
    if (!idToFetch) return;
    setLoading(true);
    setTargetId(idToFetch); // Keep UI in sync
    try {
      const res = await api.get(`/inventory/ss/${idToFetch}`);
      setSsStock(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) {
      toast.error("Failed to load SS stock.");
      setSsStock([]);
    } finally { setLoading(false); }
  };

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/ledger');
      setLedger(Array.isArray(res.data) ? res.data : res.data.logs || []);
    } catch (err) {
      toast.error("Failed to load ledger.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'ledger') fetchLedger();
    if (activeTab === 'factory') fetchFactoryStock('1');
  }, [activeTab]);


  // --- MUTATION HANDLERS ---
  const handleProduce = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Logging production...');
    try {
      await api.post('/inventory/factory/produce', {
        product_id: parseInt(produceForm.product_id),
        quantity: parseInt(produceForm.quantity)
      });
      toast.success('Production logged successfully!', { id: toastId });
      setIsProduceModalOpen(false);
      setProduceForm({ product_id: '', quantity: '' });
      if (activeTab === 'factory') fetchFactoryStock();
    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Adjusting stock levels...');
    try {
      const { entity_type, entity_id, product_id, quantity, reason } = adjustForm;
      await api.post(`/inventory/${entity_type}/${entity_id}/adjust`, {
        product_id: parseInt(product_id),
        quantity: parseInt(quantity),
        reason: reason
      });

      toast.success('Stock adjusted successfully!', { id: toastId });
      setIsAdjustModalOpen(false);
      setAdjustForm({ entity_type: 'factory', entity_id: '1', product_id: '', quantity: '', reason: '' });

      if (activeTab === 'factory' && targetId === entity_id) fetchFactoryStock();
      if (activeTab === 'ss' && targetId === entity_id) fetchSsStock(entity_id);
      if (activeTab === 'ledger') fetchLedger();

    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  // Helper to get active list for mapping dropdowns in Adjustment Modal
  const getActiveEntityList = () => {
    if (adjustForm.entity_type === 'ss') return masterData.ss;
    if (adjustForm.entity_type === 'distributor') return masterData.distributors;
    if (adjustForm.entity_type === 'retailer') return masterData.retailers;
    return [];
  };

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-boxes-stacked text-primary me-2"></i> Inventory Control
          </h3>
          <p className="text-muted m-0 mt-1">Manage production, monitor stock levels, and audit ledgers.</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary bg-white shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsAdjustModalOpen(true)}>
            <i className="fa-solid fa-scale-balanced me-2"></i> Adjust Stock
          </button>
          <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsProduceModalOpen(true)}>
            <i className="fa-solid fa-industry me-2"></i> Log Production
          </button>
        </div>
      </div>

      {/* TIER NAVIGATION */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-2 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <div className="nav nav-pills p-1 bg-light rounded-pill d-inline-flex w-100 w-md-auto">
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'factory' ? 'active shadow-sm fw-bold' : 'text-dark'}`} onClick={() => setActiveTab('factory')}>
              <i className="fa-solid fa-industry me-2"></i> Factory Stock
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'ss' ? 'active shadow-sm fw-bold' : 'text-dark'}`} onClick={() => { setActiveTab('ss'); setTargetId(''); }}>
              <i className="fa-solid fa-warehouse me-2"></i> SS Network Stock
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'ledger' ? 'active shadow-sm fw-bold bg-dark text-white' : 'text-dark'}`} onClick={() => setActiveTab('ledger')}>
              <i className="fa-solid fa-book-journal-whills me-2"></i> Master Ledger
            </button>
          </div>

          {/* SMART DROPDOWN FOR SS TAB */}
          {activeTab === 'ss' && (
             <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '300px' }}>
                <span className="input-group-text bg-white border-0 ps-4 text-primary"><i className="fa-solid fa-building-user"></i></span>
                <select
                  className="form-select border-0 bg-white py-2 shadow-none fw-semibold"
                  value={targetId}
                  onChange={(e) => fetchSsStock(e.target.value)}
                >
                  <option value="" disabled>Select Super Stockist to view...</option>
                  {masterData.ss.map(ss => (
                    <option key={ss.id} value={ss.id}>{ss.firm_name || ss.name} (ID: {ss.id})</option>
                  ))}
                </select>
             </div>
          )}
        </div>
      </div>

      {/* DYNAMIC CONTENT AREA */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">

        {/* VIEW: FACTORY OR SS STOCK */}
        {(activeTab === 'factory' || activeTab === 'ss') && (
          <>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Product ID</th>
                      <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Product Name</th>
                      <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Current Stock</th>
                      <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Health Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const currentList = activeTab === 'factory' ? factoryStock : ssStock;

                      if (loading) return <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>;
                      if (activeTab === 'ss' && !targetId) return <tr><td colSpan="4" className="text-center py-5 text-muted"><i className="fa-solid fa-hand-pointer fs-2 mb-2 opacity-25 d-block"></i> Please select a Super Stockist from the dropdown above.</td></tr>;
                      if (currentList.length === 0) return <tr><td colSpan="4" className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-box-open fs-2 mb-2 opacity-25 d-block"></i> Warehouse is empty.</td></tr>;

                      return currentList.map((item, idx) => {
                        const actualProductName = getProductName(item.product_id || item.id);
                        return (
                          <tr key={idx}>
                            <td className="px-4"><code className="bg-light text-dark px-2 py-1 rounded border">PRD-{item.product_id || item.id}</code></td>
                            <td className="fw-bolder text-dark">{actualProductName}</td>
                            <td>
                              <span className="fs-5 fw-bold text-dark">{item.quantity}</span>
                              <span className="text-muted small ms-1 text-uppercase">units</span>
                            </td>
                            <td className="text-end px-4">
                              <span className={`badge rounded-pill px-3 py-2 ${item.quantity > 50 ? 'bg-success bg-opacity-10 text-success' : item.quantity > 0 ? 'bg-warning bg-opacity-10 text-warning' : 'bg-danger bg-opacity-10 text-danger'}`}>
                                <i className={`fa-solid ${item.quantity > 50 ? 'fa-check' : item.quantity > 0 ? 'fa-triangle-exclamation' : 'fa-xmark'} me-1`}></i>
                                {item.quantity > 50 ? 'Optimal' : item.quantity > 0 ? 'Low Stock' : 'Stockout'}
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* VIEW: MASTER LEDGER */}
        {activeTab === 'ledger' && (
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="bg-dark text-white">
                  <tr>
                    <th className="px-4 py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Transaction ID</th>
                    <th className="py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Location / Entity</th>
                    <th className="py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Product</th>
                    <th className="py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Qty Change</th>
                    <th className="text-end px-4 py-3 text-uppercase fw-bold border-0" style={{ fontSize: '0.75rem' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                  ) : ledger.length === 0 ? (
                    <tr><td colSpan="5" className="text-center py-5 text-muted"><i className="fa-solid fa-clipboard fs-2 mb-2 opacity-25 d-block"></i> Ledger is clean.</td></tr>
                  ) : (
                    ledger.map((log, idx) => (
                      <tr key={idx}>
                        <td className="px-4"><small className="text-muted font-monospace bg-light px-2 py-1 rounded">TXN-{log.id}</small></td>
                        <td>
                          <div className="d-flex align-items-center">
                            <span className={`badge rounded-pill me-2 ${log.transaction_type === 'PRODUCTION' ? 'bg-primary' : log.transaction_type === 'ADJUSTMENT' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                              {log.transaction_type || 'TRANSFER'}
                            </span>
                            <div>
                              <div className="fw-bold text-dark">{getPartnerName(log.entity_type, log.entity_id)}</div>
                              <small className="text-muted text-uppercase">{log.entity_type}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="fw-semibold text-dark">{getProductName(log.product_id)}</div>
                          <small className="text-muted">PRD-{log.product_id}</small>
                        </td>
                        <td>
                          <span className={`fs-5 fw-bold ${log.quantity > 0 ? 'text-success' : 'text-danger'}`}>
                            {log.quantity > 0 ? '+' : ''}{log.quantity}
                          </span>
                        </td>
                        <td className="text-end px-4">
                          <div className="text-dark fw-semibold">{new Date(log.created_at || Date.now()).toLocaleDateString()}</div>
                          <small className="text-muted">{new Date(log.created_at || Date.now()).toLocaleTimeString()}</small>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* --- MODAL: LOG PRODUCTION --- */}
      {isProduceModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleProduce}>
                <div className="modal-header bg-primary bg-gradient text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-industry me-2"></i> Log Factory Production</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsProduceModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Select Product <span className="text-danger">*</span></label>
                      <select className="form-select form-select-lg border-0 shadow-sm rounded-3" required value={produceForm.product_id} onChange={e => setProduceForm({...produceForm, product_id: e.target.value})}>
                        <option value="" disabled>Choose a product...</option>
                        {masterData.products.map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.product_name} (PRD-{p.id})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Quantity Produced <span className="text-danger">*</span></label>
                      <input type="number" className="form-control form-control-lg border-0 shadow-sm rounded-3" required min="1" placeholder="Enter amount..." value={produceForm.quantity} onChange={e => setProduceForm({...produceForm, quantity: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsProduceModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary fw-semibold px-5 rounded-pill shadow-sm">Commit to Inventory</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: ADJUST STOCK --- */}
      {isAdjustModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleAdjust}>
                <div className="modal-header bg-dark bg-gradient text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-scale-balanced me-2"></i> Manual Stock Adjustment</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsAdjustModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Location Tier <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2" value={adjustForm.entity_type} onChange={e => setAdjustForm({...adjustForm, entity_type: e.target.value, entity_id: e.target.value === 'factory' ? '1' : ''})}>
                        <option value="factory">Main Factory</option>
                        <option value="ss">Super Stockist</option>
                        <option value="distributor">Distributor</option>
                        <option value="retailer">Retailer</option>
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Specific Location <span className="text-danger">*</span></label>
                      {adjustForm.entity_type === 'factory' ? (
                        <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 bg-white" disabled value="Main Factory (ID: 1)" />
                      ) : (
                        <select className="form-select border-0 shadow-sm rounded-3 py-2" required value={adjustForm.entity_id} onChange={e => setAdjustForm({...adjustForm, entity_id: e.target.value})}>
                          <option value="" disabled>Select partner...</option>
                          {getActiveEntityList().map(p => (
                            <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Select Product <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2" required value={adjustForm.product_id} onChange={e => setAdjustForm({...adjustForm, product_id: e.target.value})}>
                        <option value="" disabled>Choose a product...</option>
                        {masterData.products.map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.product_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Qty Change (+/-) <span className="text-danger">*</span></label>
                      <input type="number" className="form-control border-0 shadow-sm rounded-3 py-2" required placeholder="e.g. -5 or 10" value={adjustForm.quantity} onChange={e => setAdjustForm({...adjustForm, quantity: e.target.value})} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Reason for Adjustment</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2" placeholder="e.g. Damaged goods, Audit correction..." value={adjustForm.reason} onChange={e => setAdjustForm({...adjustForm, reason: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsAdjustModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-dark fw-semibold px-5 rounded-pill shadow-sm">Submit Audit</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}