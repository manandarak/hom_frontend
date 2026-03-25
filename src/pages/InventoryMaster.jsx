import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function InventoryMaster() {
  const { user } = useAuth();

  // --- BULLETPROOF RBAC LOGIC ---
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const userPerms = user?.permissions || [];

  // Drives database execution (Can they click the Add/Produce/Adjust buttons?)
  const isAdmin = roleName?.toLowerCase() === 'admin' || userPerms.includes('manage_roles');
  const canManageInventory = isAdmin || userPerms.includes('manage_inventory');

  // UI Layout drivers (Who sees what tab by default)
  const isExternalPartner = ['SuperStockist', 'Distributor', 'Retailer'].includes(roleName);
  const isInternalTeam = !isExternalPartner;

  // Set default tab safely based on role
  const defaultTab = isInternalTeam ? 'factory' : roleName === 'SuperStockist' ? 'ss' : 'distributor';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);

  // --- HYDRATED MASTER DATA ---
  const [masterData, setMasterData] = useState({
    products: [],
    ss: [],
    distributors: [],
    retailers: [],
    factories: []
  });

  // --- CORE DATA STATES ---
  const [factoryStock, setFactoryStock] = useState([]);
  const [ssStock, setSsStock] = useState([]);
  const [externalStock, setExternalStock] = useState([]); // For external partners
  const [ledger, setLedger] = useState([]);

  // Selections for viewing data (Internal Only)
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [selectedSsId, setSelectedSsId] = useState('');

  // --- MODAL STATES ---
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isAddFactoryModalOpen, setIsAddFactoryModalOpen] = useState(false);

  // Form States
  const [produceForm, setProduceForm] = useState({
    factory_id: '',
    product_id: '',
    quantity_produced: '',
    batch_number: '',
    production_date: new Date().toISOString().split('T')[0]
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

        setMasterData(prev => ({
          ...prev,
          products: Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.items || [],
          ss: fetchedSS,
          distributors: fetchedDistributors,
          retailers: Array.isArray(retRes.data) ? retRes.data : retRes.data?.items || [],
          factories: fetchedFactories
        }));

        // --- AUTO-LOAD LOGIC BASED ON ROLE ---
        if (isInternalTeam) {
            // Internal team auto-loads the first factory
            if (fetchedFactories.length > 0) {
                const firstFacId = fetchedFactories[0].id.toString();
                setSelectedFactoryId(firstFacId);
                setProduceForm(prev => ({...prev, factory_id: firstFacId}));
                setAdjustForm(prev => ({...prev, entity_id: firstFacId}));
                fetchFactoryStock(firstFacId);
            }
        } else {
            // External Partner auto-loads ONLY their own inventory
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

  const getEntityName = (type, id) => {
    if (!type || !id) return `Unknown Entity #${id}`;
    const safeType = type.toLowerCase();
    if (safeType === 'factory') {
      const f = masterData.factories.find(x => x.id === parseInt(id));
      return f ? f.name : `Factory #${id}`;
    }
    if (safeType === 'superstockist' || safeType === 'ss') {
      const ss = masterData.ss.find(x => x.id === parseInt(id));
      return ss ? ss.name || ss.firm_name : `Super Stockist #${id}`;
    }
    if (safeType === 'distributor') {
      const d = masterData.distributors.find(x => x.id === parseInt(id));
      return d ? d.name || d.firm_name || d.shop_name : `Distributor #${id}`;
    }
    if (safeType === 'retailer') {
      const r = masterData.retailers.find(x => x.id === parseInt(id));
      return r ? r.name || r.firm_name || r.shop_name : `Retailer #${id}`;
    }
    return `${type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()} #${id}`;
  };

  const getMovementVector = (txType, entityType) => {
    const t = txType ? txType.toUpperCase() : '';
    if (t === 'PRODUCTION') return { text: '🏭 Factory Production', badge: 'bg-dark text-white' };
    if (t === 'DISPATCH_OUT_FACTORY') return { text: '🏭 Factory ➝ 🚚 Transit', badge: 'bg-primary text-white shadow-sm' };
    if (t === 'DISPATCH_IN_TRANSIT') return { text: '🚚 Entered Logistics Network', badge: 'bg-secondary text-white' };
    if (t === 'RECEIPT_OUT_TRANSIT') return { text: '🚚 Cleared from Logistics', badge: 'bg-secondary bg-opacity-75 text-white' };
    if (t === 'RECEIPT_IN_SUPERSTOCKIST') return { text: '🚚 Transit ➝ 🏢 Super Stockist', badge: 'bg-info text-dark fw-bold shadow-sm' };
    if (t === 'RECEIPT_IN_DISTRIBUTOR') return { text: '🚚 Transit ➝ 🏢 Distributor', badge: 'bg-info text-dark fw-bold shadow-sm' };
    if (t.includes('SEC_DISPATCH_OUT') || t.includes('SECONDARY_SALE_OUT')) return { text: '🏢 Distributor ➝ 🚚 Van Dispatch', badge: 'bg-warning text-dark fw-bold shadow-sm' };
    if (t.includes('SEC_RECEIVE_IN') || t.includes('SECONDARY_SALE_IN')) return { text: '🚚 Arrived at 🏪 Retailer', badge: 'bg-success text-white shadow-sm' };
    if (t === 'RETAIL_SALE') return { text: '🏪 Retailer ➝ 💈 Barber / Consumer', badge: 'bg-success bg-gradient text-white shadow-sm' };
    if (t.includes('CANCEL')) return { text: `↩️ Reverted Stock (${entityType})`, badge: 'bg-danger text-white' };
    if (t === 'ADJUSTMENT') return { text: `⚖️ Audit Adjustment (${entityType})`, badge: 'bg-light text-dark border border-secondary border-opacity-50' };
    return { text: `🔄 ${t || 'UNKNOWN'}`, badge: 'bg-light text-dark border border-secondary border-opacity-50' };
  };

  // --- DATA FETCHERS ---
  const fetchFactoryStock = async (id) => {
    if (!id) return;
    setLoading(true);
    setSelectedFactoryId(id);
    try {
      const res = await api.get(`/inventory/factory/${id}`);
      setFactoryStock(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch (err) { setFactoryStock([]); }
    finally { setLoading(false); }
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


  // --- MUTATIONS (MANAGEMENT PERMISSION ONLY) ---
  const handleProduce = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Minting new stock...');
    try {
      await api.post('/inventory/factory/produce', {
        product_id: parseInt(produceForm.product_id),
        factory_id: parseInt(produceForm.factory_id),
        quantity_produced: parseInt(produceForm.quantity_produced),
        batch_number: produceForm.batch_number,
        production_date: produceForm.production_date
      });

      toast.success('Production successfully logged!', { id: toastId });
      setIsProduceModalOpen(false);

      setProduceForm({ ...produceForm, product_id: '', quantity_produced: '', batch_number: '', production_date: new Date().toISOString().split('T')[0] });

      if (activeTab === 'factory' && selectedFactoryId === produceForm.factory_id) {
          fetchFactoryStock(produceForm.factory_id);
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
      await api.post(`/inventory/${entity_type}/${entity_id}/adjust`, {
        product_id: parseInt(product_id),
        quantity_change: parseInt(quantity),
        reference_document: reason || 'Manual Adjustment',
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
      const newFactoryObj = res.data;

      setMasterData(prev => ({ ...prev, factories: [...prev.factories, newFactoryObj] }));

      toast.success(`${newFactoryName} registered successfully!`, { id: toastId });
      setIsAddFactoryModalOpen(false);
      setNewFactoryName('');

      const newId = newFactoryObj.id.toString();
      setSelectedFactoryId(newId);
      setProduceForm(prev => ({...prev, factory_id: newId}));
      setAdjustForm(prev => ({...prev, entity_id: newId}));
      setFactoryStock([]);
      setActiveTab('factory');

    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f4f7f8', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-boxes-packing text-primary me-2"></i>
            {isInternalTeam ? 'Inventory Control' : 'My Inventory'}
          </h3>
          <p className="text-muted m-0 mt-1">
            {isInternalTeam ? 'Monitor pipelines, log production, and audit stock levels.' : 'View real-time stock quantities available for dispatch.'}
          </p>
        </div>

        {/* ACTION BUTTONS (SECURED VIA PERMISSION ARRAY) */}
        {canManageInventory && (
          <div className="d-flex gap-2">
            <button className="btn btn-outline-primary shadow-sm rounded-pill px-4 fw-semibold border-2" onClick={() => setIsAddFactoryModalOpen(true)}>
              <i className="fa-solid fa-plus me-2"></i> Add Plant
            </button>
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsAdjustModalOpen(true)}>
              <i className="fa-solid fa-scale-unbalanced me-2"></i> Audit / Adjust
            </button>
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsProduceModalOpen(true)}>
              <i className="fa-solid fa-industry me-2"></i> Log Production
            </button>
          </div>
        )}
      </div>

      {/* TIER NAVIGATION (INTERNAL TEAMS ONLY) */}
      {isInternalTeam && (
        <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white">
          <div className="card-body p-3 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
            <div className="nav nav-pills p-1 bg-light rounded-pill d-inline-flex w-100 w-md-auto">
              <button className={`nav-link rounded-pill flex-grow-1 px-4 ${activeTab === 'factory' ? 'active shadow-sm fw-bold' : 'text-dark fw-semibold'}`} onClick={() => setActiveTab('factory')}>
                <i className="fa-solid fa-industry me-2"></i> Factory Stock
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
                    {masterData.factories.length === 0 && <option value="" disabled>No factories registered</option>}
                    {masterData.factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
              </div>
            )}

            {activeTab === 'ss' && (
              <div className="input-group shadow-sm rounded-pill overflow-hidden w-auto" style={{ minWidth: '350px' }}>
                  <span className="input-group-text bg-success bg-opacity-10 border-0 ps-4 text-success fw-bold"><i className="fa-solid fa-warehouse me-2"></i> View SS:</span>
                  <select className="form-select border-0 bg-light py-2 shadow-none fw-semibold" value={selectedSsId} onChange={(e) => fetchSsStock(e.target.value)}>
                    <option value="" disabled>Select a Super Stockist...</option>
                    {masterData.ss.map(ss => <option key={ss.id} value={ss.id}>{ss.firm_name || ss.name}</option>)}
                  </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DYNAMIC CONTENT AREA */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">

        {/* FACTORY, SS, OR EXTERNAL STOCK TABLES */}
        {activeTab !== 'ledger' && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>SKU Info</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Product Nomenclature</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Total Count</th>
                  <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Health Indicator</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let currentList = [];
                  let isReady = false;

                  if (isInternalTeam) {
                      currentList = activeTab === 'factory' ? factoryStock : ssStock;
                      isReady = activeTab === 'factory' ? selectedFactoryId : selectedSsId;
                  } else {
                      currentList = externalStock;
                      isReady = true; // External user is naturally mapped
                  }

                  if (loading) return <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>;
                  if (!isReady) return <tr><td colSpan="4" className="text-center py-5 text-muted"><i className="fa-solid fa-hand-pointer fs-2 mb-3 opacity-25 d-block"></i> Select an entity from the dropdown above.</td></tr>;
                  if (currentList.length === 0) return <tr><td colSpan="4" className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-box-open fs-2 mb-3 opacity-25 d-block"></i> No stock registered.</td></tr>;

                  return currentList.map((item, idx) => {
                    const stockQty = item.current_stock_qty ?? item.current_stock ?? item.quantity ?? 0;

                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-transparent' : 'bg-light bg-opacity-50'}>
                        <td className="px-4">
                          <code className="bg-dark bg-opacity-10 text-dark px-2 py-1 rounded fw-bold border">SKU-{item.product_id || item.id}</code>
                        </td>
                        <td className="fw-bolder text-dark fs-6">{getProductName(item.product_id || item.id)}</td>
                        <td>
                          <span className="fs-4 fw-bold text-dark">{stockQty}</span>
                          <span className="text-muted small ms-2 text-uppercase fw-semibold">Units</span>
                        </td>
                        <td className="text-end px-4">
                          <span className={`badge rounded-pill px-3 py-2 ${stockQty > 100 ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-25' : stockQty > 20 ? 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25' : 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25'}`}>
                            <i className={`fa-solid ${stockQty > 100 ? 'fa-check' : stockQty > 20 ? 'fa-triangle-exclamation' : 'fa-skull-crossbones'} me-1`}></i>
                            {stockQty > 100 ? 'Optimal' : stockQty > 20 ? 'Reorder Soon' : 'Critical Stockout'}
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* --- GLOBAL LEDGER TABLE (INTERNAL TEAMS ONLY) --- */}
        {activeTab === 'ledger' && isInternalTeam && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-4 py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>Timestamp</th>
                  <th className="py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>Ref Document</th>
                  <th className="py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>Movement Vector (From ➝ To)</th>
                  <th className="py-3 text-uppercase fw-bold border-secondary" style={{ fontSize: '0.75rem' }}>SKU / Batch</th>
                  <th className="px-4 py-3 text-uppercase fw-bold border-secondary text-center" style={{ fontSize: '0.75rem', minWidth: '220px' }}>Stock Impact (Opening ➝ Delta ➝ Closing)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr> :
                 ledger.length === 0 ? <tr><td colSpan="5" className="text-center py-5 text-muted"><i className="fa-solid fa-clipboard fs-2 mb-3 opacity-25 d-block"></i> Ledger is pristine.</td></tr> :
                 ledger.map((log, idx) => {

                  const vector = getMovementVector(log.transaction_type, log.entity_type);

                  const delta = log.quantity_change ?? log.quantity ?? 0;
                  const closing = log.closing_balance !== undefined && log.closing_balance !== null ? log.closing_balance : 0;
                  const opening = closing - delta;
                  const isPositive = delta > 0;

                  return (
                    <tr key={log.id || idx}>
                      <td className="px-4">
                        <div className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>
                          {new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-muted small fw-semibold">
                          {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td>
                        <code className="bg-light text-dark px-2 py-1 rounded border shadow-sm fw-bold">
                          {log.reference_document || `TXN-${log.id}`}
                        </code>
                      </td>
                      <td>
                        <span className={`badge rounded-pill px-3 py-2 ${vector.badge}`}>
                          {vector.text}
                        </span>
                        <div className="mt-1 small fw-bold text-muted opacity-75 ms-2">
                          Owner: {getEntityName(log.entity_type, log.entity_id)}
                        </div>
                      </td>
                      <td>
                        <div className="fw-bolder text-dark mb-1">{getProductName(log.product_id)}</div>
                        {log.batch_number && (
                          <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill">
                            <i className="fa-solid fa-barcode me-1"></i> {log.batch_number}
                          </span>
                        )}
                      </td>
                      <td className="px-4">
                        <div className="d-flex align-items-center justify-content-between bg-light rounded-pill px-3 py-2 border shadow-sm">
                          <div className="text-center" style={{ minWidth: '40px' }} title="Opening Balance">
                             <span className="text-muted fw-bold small">{opening}</span>
                          </div>
                          <i className="fa-solid fa-arrow-right mx-2 text-muted opacity-50"></i>
                          <div className="text-center" style={{ minWidth: '60px' }}>
                            <span className={`badge rounded-pill fs-6 px-3 shadow-sm ${isPositive ? 'bg-success' : 'bg-danger'}`} title="Quantity Change">
                              {isPositive ? '+' : ''}{delta}
                            </span>
                          </div>
                          <i className="fa-solid fa-arrow-right mx-2 text-muted opacity-50"></i>
                          <div className="text-center" style={{ minWidth: '40px' }} title="Closing Balance">
                            <span className="text-dark fw-bolder fs-5">{closing}</span>
                          </div>
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

      {/* --- ALL MODALS BELOW ARE SECURED BY PERMISSIONS --- */}

      {/* NEW MODAL: ADD FACTORY */}
      {isAddFactoryModalOpen && canManageInventory && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleAddFactory}>
                <div className="modal-header bg-dark text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-industry me-2 text-primary"></i> Register New Plant</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsAddFactoryModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-uppercase text-muted mb-1">Plant / Factory Name <span className="text-danger">*</span></label>
                    <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 fw-semibold" required placeholder="e.g. North India Manufacturing Unit" value={newFactoryName} onChange={e => setNewFactoryName(e.target.value)} />
                  </div>
                  <div className="p-3 bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-3 text-dark small fw-semibold">
                    <i className="fa-solid fa-circle-info text-primary me-2"></i>
                    Once registered, this facility will immediately be available for logging production batches.
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsAddFactoryModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary fw-bold px-5 rounded-pill shadow-sm"><i className="fa-solid fa-check me-2"></i> Register Plant</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LOG PRODUCTION */}
      {isProduceModalOpen && canManageInventory && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleProduce}>
                <div className="modal-header bg-primary bg-gradient text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-industry me-2"></i> Register New Production</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsProduceModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Target Plant <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-semibold" required value={produceForm.factory_id} onChange={e => setProduceForm({...produceForm, factory_id: e.target.value})}>
                        <option value="" disabled>Select Plant...</option>
                        {masterData.factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Product SKU <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-semibold" required value={produceForm.product_id} onChange={e => setProduceForm({...produceForm, product_id: e.target.value})}>
                        <option value="" disabled>Select SKU...</option>
                        {masterData.products.map(p => <option key={p.id} value={p.id}>{p.name || p.product_name}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Batch Number <span className="text-danger">*</span></label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 text-uppercase fw-bold" required placeholder="e.g. BATCH-001A" value={produceForm.batch_number} onChange={e => setProduceForm({...produceForm, batch_number: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Production Date <span className="text-danger">*</span></label>
                      <input type="date" className="form-control border-0 shadow-sm rounded-3 py-2 fw-semibold text-muted" required value={produceForm.production_date} onChange={e => setProduceForm({...produceForm, production_date: e.target.value})} />
                    </div>
                    <div className="col-12 mt-4">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Units Minted <span className="text-danger">*</span></label>
                      <input type="number" className="form-control form-control-lg border-0 shadow-sm rounded-3 fw-bold text-success fs-4" required min="1" placeholder="+0" value={produceForm.quantity_produced} onChange={e => setProduceForm({...produceForm, quantity_produced: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsProduceModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary fw-bold px-5 rounded-pill shadow-sm"><i className="fa-solid fa-cloud-arrow-up me-2"></i> Commit to DB</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADJUST STOCK */}
      {isAdjustModalOpen && canManageInventory && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleAdjust}>
                <div className="modal-header bg-dark bg-gradient text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-scale-unbalanced me-2"></i> Forced Stock Audit</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsAdjustModalOpen(false)}></button>
                </div>
                <div className="p-3 bg-warning bg-opacity-10 border-bottom border-warning border-opacity-25 text-dark small fw-semibold d-flex align-items-center">
                  <i className="fa-solid fa-triangle-exclamation text-warning fs-5 mx-3"></i>
                  Warning: Adjustments bypass standard Order workflows and should only be used for damage write-offs, shrinkage, or audit corrections.
                </div>
                <div className="modal-body p-4 bg-light">
                  <div className="row g-4">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Entity Class <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-semibold" value={adjustForm.entity_type} onChange={e => setAdjustForm({...adjustForm, entity_type: e.target.value, entity_id: ''})}>
                        <option value="factory">Manufacturing Plant</option>
                        <option value="ss">Super Stockist</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Specific Target <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-bold text-primary" required value={adjustForm.entity_id} onChange={e => setAdjustForm({...adjustForm, entity_id: e.target.value})}>
                        <option value="" disabled>Select {adjustForm.entity_type}...</option>
                        {(adjustForm.entity_type === 'factory' ? masterData.factories : masterData.ss).map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.firm_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Target Asset <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-semibold" required value={adjustForm.product_id} onChange={e => setAdjustForm({...adjustForm, product_id: e.target.value})}>
                        <option value="" disabled>Select SKU...</option>
                        {masterData.products.map(p => <option key={p.id} value={p.id}>{p.name || p.product_name}</option>)}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Numeric Delta <span className="text-danger">*</span></label>
                      <input type="number" className="form-control border-0 shadow-sm rounded-3 py-2 fw-bold" required placeholder="e.g. -10 (shrinkage) or +5" value={adjustForm.quantity} onChange={e => setAdjustForm({...adjustForm, quantity: e.target.value})} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Audit Justification</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2" placeholder="e.g. Broken in transit, cycle count correction..." value={adjustForm.reason} onChange={e => setAdjustForm({...adjustForm, reason: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsAdjustModalOpen(false)}>Abort</button>
                  <button type="submit" className="btn btn-dark fw-bold px-5 rounded-pill shadow-sm"><i className="fa-solid fa-signature me-2"></i> Authorize Fix</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}