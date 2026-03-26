import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function InventoryMaster() {
  const { user } = useAuth();

  // --- BULLETPROOF RBAC LOGIC ---
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const userPerms = user?.permissions || [];

  const isAdmin = roleName?.toLowerCase() === 'admin' || userPerms.includes('manage_roles');
  const canManageInventory = isAdmin || userPerms.includes('manage_inventory');

  const isExternalPartner = ['SuperStockist', 'Distributor', 'Retailer'].includes(roleName);
  const isInternalTeam = !isExternalPartner;

  const defaultTab = isInternalTeam ? 'factory' : roleName === 'SuperStockist' ? 'ss' : 'distributor';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);

  // --- HYDRATED MASTER DATA ---
  const [masterData, setMasterData] = useState({
    products: [], ss: [], distributors: [], retailers: [], factories: []
  });

  // --- CORE DATA STATES ---
  // Factory is now split into the 3 true manufacturing buckets
  const [factoryFgStock, setFactoryFgStock] = useState([]);
  const [factoryWipStock, setFactoryWipStock] = useState([]);
  const [factoryScrapStock, setFactoryScrapStock] = useState([]);

  const [ssStock, setSsStock] = useState([]);
  const [externalStock, setExternalStock] = useState([]);
  const [ledger, setLedger] = useState([]);

  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [selectedSsId, setSelectedSsId] = useState('');

  // --- MODAL STATES ---
  const [isOpeningStockModalOpen, setIsOpeningStockModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isAddFactoryModalOpen, setIsAddFactoryModalOpen] = useState(false);

  const [openingStockForm, setOpeningStockForm] = useState({
    factory_id: '', product_id: '', quantity: '', batch_number: '', type: 'FG'
  });

  const [adjustForm, setAdjustForm] = useState({ entity_type: 'factory', entity_id: '', product_id: '', quantity: '', reason: '' });
  const [newFactoryName, setNewFactoryName] = useState('');

  // --- 1. HYDRATION ON MOUNT ---
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [prodRes, ssRes, distRes, retRes, facRes] = await Promise.all([
          api.get('/products').catch(() => ({ data: [] })),
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] })),
          api.get('/inventory/factories').catch(() => ({ data: [] }))
        ]);

        const fetchedFactories = Array.isArray(facRes.data) ? facRes.data : facRes.data?.items || [];
        const fetchedSS = Array.isArray(ssRes.data) ? ssRes.data : ssRes.data?.items || [];
        const fetchedDistributors = Array.isArray(distRes.data) ? distRes.data : distRes.data?.items || [];

        setMasterData({
          products: Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.items || [],
          ss: fetchedSS,
          distributors: fetchedDistributors,
          retailers: Array.isArray(retRes.data) ? retRes.data : retRes.data?.items || [],
          factories: fetchedFactories
        });

        if (isInternalTeam && fetchedFactories.length > 0) {
            const firstFacId = fetchedFactories[0].id.toString();
            setSelectedFactoryId(firstFacId);
            setOpeningStockForm(prev => ({...prev, factory_id: firstFacId}));
            setAdjustForm(prev => ({...prev, entity_id: firstFacId}));
            fetchFactoryStock(firstFacId);
        } else if (isExternalPartner) {
            const partnerList = roleName === 'SuperStockist' ? fetchedSS : fetchedDistributors;
            if (partnerList.length > 0) {
                fetchExternalStock(roleName === 'SuperStockist' ? 'ss' : 'distributor', partnerList[0].id);
            }
        }
      } catch (err) {
        console.error("Hydration failed", err);
      }
    };
    fetchMasterData();
  }, [isInternalTeam, roleName]);

  // --- TRANSLATORS ---
  const getProductName = (id) => {
    const p = masterData.products.find(x => x.id === parseInt(id));
    return p ? p.name || p.product_name : `PRD-${id}`;
  };

  const getProductSku = (id) => {
    const p = masterData.products.find(x => x.id === parseInt(id));
    // FIXED: Safely fallback between sku and sku_code to prevent crashes
    return p ? (p.sku_code || p.sku || `SKU-${id}`) : `SKU-${id}`;
  };

  const getEntityName = (type, id) => {
    if (!type || !id) return `Unknown Entity #${id}`;
    const safeType = type.toLowerCase();
    if (['factory', 'wip', 'scrap'].includes(safeType)) {
      const f = masterData.factories.find(x => x.id === parseInt(id));
      return f ? f.name : `Factory #${id}`;
    }
    if (safeType === 'superstockist' || safeType === 'ss') {
      const ss = masterData.ss.find(x => x.id === parseInt(id));
      return ss ? ss.name || ss.firm_name : `Super Stockist #${id}`;
    }
    return `${type.toUpperCase()} #${id}`;
  };

  const getMovementVector = (txType, entityType) => {
    const t = txType ? txType.toUpperCase() : '';
    if (t.includes('PRODUCED')) return { text: '🏭 Factory Production', badge: 'bg-dark text-white' };
    if (t === 'DISPATCH_OUT_FACTORY') return { text: '🏭 Factory ➝ 🚚 Transit', badge: 'bg-primary text-white' };
    if (t.includes('RECEIPT_IN')) return { text: '🚚 Arrived at Destination', badge: 'bg-info text-dark fw-bold' };
    if (t.includes('SALE_OUT') || t.includes('DISPATCH_OUT')) return { text: '🏢 Dispatched Out', badge: 'bg-warning text-dark fw-bold' };
    if (t === 'RM_INTAKE') return { text: '📦 Raw Material Received', badge: 'bg-secondary text-white' };
    if (t === 'ADJUSTMENT') return { text: `⚖️ Audit Adjustment`, badge: 'bg-light text-dark border' };
    return { text: `🔄 ${t || 'UNKNOWN'}`, badge: 'bg-light text-dark border' };
  };

  // --- DATA FETCHERS ---
  const fetchFactoryStock = async (id) => {
    if (!id) return;
    setLoading(true);
    setSelectedFactoryId(id);
    try {
      // 🚨 NEW: Fetch all 3 buckets to give a true representation of the factory floor
      const [fgRes, wipRes, scrapRes] = await Promise.all([
        api.get(`/inventory/factory/${id}`).catch(() => ({ data: [] })),
        api.get(`/production/wip/factory/${id}`).catch(() => ({ data: [] })),
        api.get(`/production/scrap/factory/${id}`).catch(() => ({ data: [] }))
      ]);

      setFactoryFgStock(Array.isArray(fgRes.data) ? fgRes.data : fgRes.data.items || []);
      setFactoryWipStock(Array.isArray(wipRes.data) ? wipRes.data : []);
      setFactoryScrapStock(Array.isArray(scrapRes.data) ? scrapRes.data : []);
    } catch (err) {
      setFactoryFgStock([]); setFactoryWipStock([]); setFactoryScrapStock([]);
    } finally { setLoading(false); }
  };

  const fetchSsStock = async (id) => {
    if (!id) return;
    setLoading(true);
    setSelectedSsId(id);
    try {
      const res = await api.get(`/inventory/ss/${id}`);
      setSsStock(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) { setSsStock([]); }
    finally { setLoading(false); }
  };

  const fetchExternalStock = async (tier, id) => {
    setLoading(true);
    try {
      const res = await api.get(`/inventory/${tier}/${id}`);
      setExternalStock(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) { setExternalStock([]); }
    finally { setLoading(false); }
  };

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/ledger');
      setLedger(Array.isArray(res.data) ? res.data : res.data.logs || res.data || []);
    } catch (err) { toast.error("Failed to load audit ledger."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'ledger' && isInternalTeam) fetchLedger();
  }, [activeTab, isInternalTeam]);

  // --- MUTATIONS ---
  const handleOpeningStock = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Injecting opening balance...');
    try {
      // Repurposed to handle manual injection of FG prior to MES launch
      await api.post('/inventory/factory/adjust', {
        product_id: parseInt(openingStockForm.product_id),
        quantity_change: parseInt(openingStockForm.quantity),
        reference_document: `OPENING-BAL-${openingStockForm.batch_number}`,
        transaction_type: 'ADJUSTMENT'
      });

      toast.success('Opening stock injected!', { id: toastId });
      setIsOpeningStockModalOpen(false);
      setOpeningStockForm({ ...openingStockForm, product_id: '', quantity: '', batch_number: '' });
      if (activeTab === 'factory' && selectedFactoryId === openingStockForm.factory_id) {
          fetchFactoryStock(openingStockForm.factory_id);
      }
    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Applying stock adjustment...');
    try {
      const { entity_type, entity_id, product_id, quantity, reason } = adjustForm;
      // Now supports /wip/{id}/adjust and /scrap/{id}/adjust
      await api.post(`/inventory/${entity_type}/${entity_id}/adjust`, {
        product_id: parseInt(product_id),
        quantity_change: parseInt(quantity),
        reference_document: reason || 'Manual Audit Adjustment',
        transaction_type: 'ADJUSTMENT'
      });

      toast.success('Inventory audited successfully!', { id: toastId });
      setIsAdjustModalOpen(false);
      setAdjustForm({ ...adjustForm, product_id: '', quantity: '', reason: '' });

      if (activeTab === 'factory' && selectedFactoryId === entity_id) fetchFactoryStock(entity_id);
      if (activeTab === 'ss' && selectedSsId === entity_id) fetchSsStock(entity_id);
      if (activeTab === 'ledger') fetchLedger();
    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const handleAddFactory = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Registering new facility...');
    try {
      const res = await api.post('/inventory/factories', { name: newFactoryName });
      setMasterData(prev => ({ ...prev, factories: [...prev.factories, res.data] }));
      toast.success(`${newFactoryName} registered successfully!`, { id: toastId });
      setIsAddFactoryModalOpen(false);
      setNewFactoryName('');
    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  // Helper renderer for table rows
  const renderStockRow = (item, typeBadge, typeClass) => {
    const stockQty = item.current_stock_qty ?? item.current_qty ?? item.quantity ?? 0;
    return (
      <tr key={item.id} className="bg-white">
        <td className="px-4">
          <code className="bg-dark bg-opacity-10 text-dark px-2 py-1 rounded fw-bold border">{getProductSku(item.product_id)}</code>
          <div className="mt-1"><span className={`badge ${typeClass} bg-opacity-10 text-dark border border-opacity-25`}>{typeBadge}</span></div>
        </td>
        <td>
            <div className="fw-bolder text-dark fs-6">{getProductName(item.product_id)}</div>
            <div className="text-muted small">Batch: {item.batch_number || 'N/A'}</div>
        </td>
        <td>
          <span className="fs-5 fw-bold text-dark">{stockQty}</span>
          <span className="text-muted small ms-1 text-uppercase fw-semibold">{item.uom || 'UNITS'}</span>
        </td>
        <td className="text-end px-4">
          <span className={`badge rounded-pill px-3 py-2 ${stockQty > 0 ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-25' : 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25'}`}>
            {stockQty > 0 ? 'In Stock' : 'Depleted'}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f4f7f8', minHeight: '100vh' }}>
      <Toaster position="top-right" />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-boxes-packing text-primary me-2"></i>
            {isInternalTeam ? 'Warehouse Master' : 'My Inventory'}
          </h3>
          <p className="text-muted m-0 mt-1">Global view of Finished Goods, Floor WIP, and Audit adjustments.</p>
        </div>

        {canManageInventory && (
          <div className="d-flex gap-2">
            <button className="btn btn-outline-primary shadow-sm rounded-pill px-4 fw-semibold border-2" onClick={() => setIsAddFactoryModalOpen(true)}>
              <i className="fa-solid fa-plus me-2"></i> Add Plant
            </button>
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsAdjustModalOpen(true)}>
              <i className="fa-solid fa-scale-unbalanced me-2"></i> Audit / Adjust
            </button>
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsOpeningStockModalOpen(true)}>
              <i className="fa-solid fa-box-open me-2"></i> Inject Opening Stock
            </button>
          </div>
        )}
      </div>

      {/* TIER NAVIGATION */}
      {isInternalTeam && (
        <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white">
          <div className="card-body p-3 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
            <div className="nav nav-pills p-1 bg-light rounded-pill d-inline-flex w-100 w-md-auto">
              <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'factory' ? 'active shadow-sm fw-bold' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('factory')}>
                <i className="fa-solid fa-industry me-2"></i> Factory (All Types)
              </button>
              <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'ss' ? 'active shadow-sm fw-bold' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('ss')}>
                <i className="fa-solid fa-warehouse me-2"></i> Super Stockists
              </button>
              <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'ledger' ? 'active shadow-sm fw-bold bg-dark text-white' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('ledger')}>
                <i className="fa-solid fa-book-journal-whills me-2"></i> Global Ledger
              </button>
            </div>

            {activeTab === 'factory' && (
              <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '350px' }}>
                  <span className="input-group-text bg-primary bg-opacity-10 border-0 ps-4 text-primary fw-bold"><i className="fa-solid fa-industry me-2"></i> View:</span>
                  <select className="form-select border-0 bg-light py-2 shadow-none fw-semibold" value={selectedFactoryId} onChange={(e) => fetchFactoryStock(e.target.value)}>
                    {masterData.factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DYNAMIC CONTENT AREA */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">

        {/* FACTORY VIEW (Categorized) */}
        {activeTab === 'factory' && isInternalTeam && (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>SKU / Type</th>
                    <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Product & Batch</th>
                    <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Quantity</th>
                    <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr> :
                   (!factoryFgStock.length && !factoryWipStock.length && !factoryScrapStock.length) ?
                   <tr><td colSpan="4" className="text-center py-5 text-muted fw-bold">No stock in this factory.</td></tr> :
                   <>
                     {/* 1. Finished Goods */}
                     {factoryFgStock.length > 0 && <tr><td colSpan="4" className="bg-light fw-bold text-success px-4 py-2 border-bottom"><i className="fa-solid fa-box-check me-2"></i> Finished Goods (Ready for Dispatch)</td></tr>}
                     {factoryFgStock.map(item => renderStockRow(item, 'Finished Good', 'bg-success'))}

                     {/* 2. WIP / Raw Materials */}
                     {factoryWipStock.length > 0 && <tr><td colSpan="4" className="bg-light fw-bold text-warning px-4 py-2 border-bottom border-top"><i className="fa-solid fa-gears me-2"></i> Raw Materials & Work in Progress</td></tr>}
                     {factoryWipStock.map(item => renderStockRow(item, 'RM / WIP', 'bg-warning'))}

                     {/* 3. Scrap */}
                     {factoryScrapStock.length > 0 && <tr><td colSpan="4" className="bg-light fw-bold text-danger px-4 py-2 border-bottom border-top"><i className="fa-solid fa-trash-can me-2"></i> Accumulated Scrap</td></tr>}
                     {factoryScrapStock.map(item => renderStockRow(item, 'Scrap Waste', 'bg-danger'))}
                   </>
                  }
                </tbody>
              </table>
            </div>
        )}

        {/* SS OR EXTERNAL VIEW (Standard Flat List) */}
        {activeTab !== 'factory' && activeTab !== 'ledger' && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
               {/* Same table headers as above */}
               <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>SKU Info</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Product Nomenclature</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Total Count</th>
                  <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Health</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr> :
                 (isInternalTeam ? ssStock : externalStock).length === 0 ? <tr><td colSpan="4" className="text-center py-5 text-muted">No stock available.</td></tr> :
                 (isInternalTeam ? ssStock : externalStock).map((item, idx) => (
                   <tr key={idx}>
                      <td className="px-4"><code className="bg-dark bg-opacity-10 text-dark px-2 py-1 rounded fw-bold border">{getProductSku(item.product_id || item.id)}</code></td>
                      <td className="fw-bolder text-dark fs-6">{getProductName(item.product_id || item.id)}</td>
                      <td><span className="fs-5 fw-bold text-dark">{item.current_stock_qty ?? item.quantity ?? 0}</span></td>
                      <td className="text-end px-4"><span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25">Available</span></td>
                   </tr>
                 ))}
              </tbody>
            </table>
          </div>
        )}

        {/* GLOBAL LEDGER */}
        {activeTab === 'ledger' && isInternalTeam && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-4 py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>Timestamp</th>
                  <th className="py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>Ref Document</th>
                  <th className="py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>Movement Vector</th>
                  <th className="py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>SKU / Batch</th>
                  <th className="px-4 py-3 text-uppercase fw-bold border-secondary text-center" style={{ fontSize: '0.75rem', minWidth: '220px' }}>Stock Impact</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr> :
                 ledger.map((log, idx) => {
                  const vector = getMovementVector(log.transaction_type, log.entity_type);
                  const delta = log.quantity_change ?? log.quantity ?? 0;
                  const closing = log.closing_balance ?? 0;
                  const opening = closing - delta;

                  return (
                    <tr key={log.id || idx}>
                      <td className="px-4 text-muted small">{new Date(log.created_at).toLocaleString()}</td>
                      <td><code className="bg-light text-dark px-2 py-1 rounded border shadow-sm fw-bold">{log.reference_document || `TXN-${log.id}`}</code></td>
                      <td>
                        <span className={`badge rounded-pill px-3 py-2 ${vector.badge}`}>{vector.text}</span>
                        <div className="mt-1 small fw-bold text-muted opacity-75 ms-2">Owner: {getEntityName(log.entity_type, log.entity_id)}</div>
                      </td>
                      <td>
                        <div className="fw-bolder text-dark mb-1">{getProductName(log.product_id)}</div>
                        <div className="text-muted small">{getProductSku(log.product_id)}</div>
                      </td>
                      <td className="px-4 text-center">
                        <div className="d-inline-flex align-items-center bg-light rounded-pill px-3 py-1 border shadow-sm">
                          <span className="text-muted fw-bold small me-2">{opening}</span> ➝
                          <span className={`badge rounded-pill mx-2 ${delta > 0 ? 'bg-success' : 'bg-danger'}`}>{delta > 0 ? '+' : ''}{delta}</span> ➝
                          <span className="text-dark fw-bolder fs-6 ms-2">{closing}</span>
                        </div>
                      </td>
                    </tr>
                  )
                 })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* ADD FACTORY */}
      {isAddFactoryModalOpen && canManageInventory && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleAddFactory}>
                <div className="modal-header bg-dark text-white border-0 p-4">
                  <h5 className="modal-title fw-bold">Register New Plant</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setIsAddFactoryModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <label className="form-label small fw-bold text-muted">Plant Name</label>
                  <input type="text" className="form-control py-2 fw-semibold" required value={newFactoryName} onChange={e => setNewFactoryName(e.target.value)} />
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light rounded-pill" onClick={() => setIsAddFactoryModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary rounded-pill px-4">Save</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* OPENING STOCK (Renamed from Log Production) */}
      {isOpeningStockModalOpen && canManageInventory && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleOpeningStock}>
                <div className="modal-header bg-primary text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-box-open me-2"></i> Inject Opening Stock</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setIsOpeningStockModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Target Plant</label>
                    <select className="form-select py-2 fw-semibold" required value={openingStockForm.factory_id} onChange={e => setOpeningStockForm({...openingStockForm, factory_id: e.target.value})}>
                      <option value="" disabled>Select Plant...</option>
                      {masterData.factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Product SKU (FG)</label>
                    <select className="form-select py-2 fw-semibold" required value={openingStockForm.product_id} onChange={e => setOpeningStockForm({...openingStockForm, product_id: e.target.value})}>
                      <option value="" disabled>Select SKU...</option>
                      {masterData.products.filter(p => p.item_type !== 'RM').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Legacy Batch Number</label>
                    <input type="text" className="form-control py-2 text-uppercase fw-bold" required value={openingStockForm.batch_number} onChange={e => setOpeningStockForm({...openingStockForm, batch_number: e.target.value})} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Units Count</label>
                    <input type="number" className="form-control py-2 fw-bold text-success" required value={openingStockForm.quantity} onChange={e => setOpeningStockForm({...openingStockForm, quantity: e.target.value})} />
                  </div>
                  <div className="col-12 mt-3 small text-muted">
                    * Note: To run actual production, use the Factory MES module. This tool is strictly for Day-1 data injection.
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light rounded-pill" onClick={() => setIsOpeningStockModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary rounded-pill px-4">Inject Balance</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST / AUDIT STOCK */}
      {isAdjustModalOpen && canManageInventory && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleAdjust}>
                <div className="modal-header bg-dark text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-scale-unbalanced me-2"></i> Forced Stock Audit</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setIsAdjustModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Entity Class (Inventory Type)</label>
                    {/* FIXED: Now supports WIP and Scrap auditing! */}
                    <select className="form-select py-2 fw-semibold" value={adjustForm.entity_type} onChange={e => setAdjustForm({...adjustForm, entity_type: e.target.value, entity_id: ''})}>
                      <option value="factory">Factory (Finished Goods)</option>
                      <option value="wip">Factory (Raw Material / WIP)</option>
                      <option value="scrap">Factory (Scrap Waste)</option>
                      <option value="ss">Super Stockist (FG)</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Specific Target</label>
                    <select className="form-select py-2 fw-bold text-primary" required value={adjustForm.entity_id} onChange={e => setAdjustForm({...adjustForm, entity_id: e.target.value})}>
                      <option value="" disabled>Select Target...</option>
                      {(adjustForm.entity_type === 'ss' ? masterData.ss : masterData.factories).map(p => (
                        <option key={p.id} value={p.id}>{p.name || p.firm_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Target SKU</label>
                    <select className="form-select py-2 fw-semibold" required value={adjustForm.product_id} onChange={e => setAdjustForm({...adjustForm, product_id: e.target.value})}>
                      <option value="" disabled>Select SKU...</option>
                      {masterData.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted">Numeric Delta (e.g. -5 or 10)</label>
                    <input type="number" className="form-control py-2 fw-bold" required value={adjustForm.quantity} onChange={e => setAdjustForm({...adjustForm, quantity: e.target.value})} />
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-bold text-muted">Audit Justification</label>
                    <input type="text" className="form-control py-2" placeholder="e.g. Broken in transit, spilled, recount..." value={adjustForm.reason} onChange={e => setAdjustForm({...adjustForm, reason: e.target.value})} />
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light rounded-pill" onClick={() => setIsAdjustModalOpen(false)}>Abort</button>
                  <button type="submit" className="btn btn-dark rounded-pill px-4">Authorize Fix</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}