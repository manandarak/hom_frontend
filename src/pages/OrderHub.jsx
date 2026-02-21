import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

export default function OrderHub() {
  const [activeTab, setActiveTab] = useState('primary'); // 'primary', 'secondary', 'tertiary', 'consumers'
  const [loading, setLoading] = useState(false);

  // --- MASTER DATA (For Dropdowns & Translation) ---
  const [master, setMaster] = useState({
    products: [], ss: [], distributors: [], retailers: [], consumers: []
  });

  // --- LIST DATA STATES ---
  const [orders, setOrders] = useState([]);
  const [consumers, setConsumers] = useState([]);

  // --- MODAL STATES ---
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isConsumerModalOpen, setIsConsumerModalOpen] = useState(false);
  const [editingConsumerId, setEditingConsumerId] = useState(null);

  // --- FORM STATES ---
  const [orderForm, setOrderForm] = useState({ from_id: '', to_id: '', product_id: '', quantity: '' });
  const [consumerForm, setConsumerForm] = useState({ name: '', phone: '', address: '' });

  // --- 1. INITIAL HYDRATION ---
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [prod, ss, dist, ret, cons] = await Promise.all([
          api.get('/products').catch(() => ({ data: [] })),
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] })),
          api.get('/tertiary-sales/consumers').catch(() => ({ data: [] }))
        ]);
        setMaster({
          products: Array.isArray(prod.data) ? prod.data : prod.data?.items || [],
          ss: Array.isArray(ss.data) ? ss.data : ss.data?.items || [],
          distributors: Array.isArray(dist.data) ? dist.data : dist.data?.items || [],
          retailers: Array.isArray(ret.data) ? ret.data : ret.data?.items || [],
          consumers: Array.isArray(cons.data) ? cons.data : cons.data?.items || []
        });
      } catch (err) { console.error("Hydration error", err); }
    };
    fetchMasterData();
  }, []);

  // --- 2. FETCH LIST DATA BASED ON TAB ---
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'consumers') {
        const res = await api.get('/tertiary-sales/consumers');
        setConsumers(Array.isArray(res.data) ? res.data : res.data.items || []);
        // Update master consumers array silently to keep dropdowns fresh
        setMaster(prev => ({ ...prev, consumers: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      } else {
        // Handle Orders (Primary, Secondary, Tertiary)
        const endpoint = activeTab === 'primary' ? '/primary-orders/'
                       : activeTab === 'secondary' ? '/secondary-sales/'
                       : '/tertiary-sales/';

        // Graceful fallback if a specific GET all endpoint isn't fully ready backend-side yet
        const res = await api.get(endpoint).catch(() => ({ data: [] }));
        setOrders(Array.isArray(res.data) ? res.data : res.data.items || res.data.orders || []);
      }
    } catch (err) {
      toast.error(`Failed to load ${activeTab} data.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  // --- HELPERS: ID TRANSLATORS ---
  const getProductName = (id) => {
    const p = master.products.find(x => x.id === parseInt(id));
    return p ? p.name || p.product_name : `PRD-${id}`;
  };

  const getPartnerName = (tier, id) => {
    if (!id) return '-';
    let list = [];
    if (tier === 'ss') list = master.ss;
    if (tier === 'distributor') list = master.distributors;
    if (tier === 'retailer') list = master.retailers;
    if (tier === 'consumer') list = master.consumers;

    const p = list.find(x => x.id === parseInt(id));
    if (!p) return `ID: ${id}`;
    return p.name || p.firm_name || p.shop_name;
  };

  // --- MUTATIONS: CONSUMERS (BARBERS) ---
  const handleConsumerSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading(editingConsumerId ? 'Updating consumer...' : 'Registering consumer...');
    try {
      if (editingConsumerId) {
        await api.patch(`/tertiary-sales/consumers/${editingConsumerId}`, consumerForm);
        toast.success('Consumer updated', { id: toastId });
      } else {
        await api.post('/tertiary-sales/consumers', consumerForm);
        toast.success('Consumer registered', { id: toastId });
      }
      setIsConsumerModalOpen(false);
      setConsumerForm({ name: '', phone: '', address: '' });
      fetchData();
    } catch (err) { toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId }); }
  };

  const handleDeleteConsumer = async (id, name) => {
    if (!window.confirm(`Permanently remove consumer ${name}?`)) return;
    const toastId = toast.loading(`Removing ${name}...`);
    try {
      await api.delete(`/tertiary-sales/consumers/${id}`);
      toast.success('Consumer removed', { id: toastId });
      fetchData();
    } catch (err) { toast.error('Failed to remove consumer', { id: toastId }); }
  };

  // --- MUTATIONS: ORDERS ---
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading(`Placing ${activeTab} order...`);

    // Dynamically map our generic form to the specific backend payload expected
    const payload = {
      product_id: parseInt(orderForm.product_id),
      quantity: parseInt(orderForm.quantity)
    };

    if (activeTab === 'primary') {
      payload.ss_id = parseInt(orderForm.to_id); // Factory is implied
    } else if (activeTab === 'secondary') {
      payload.distributor_id = parseInt(orderForm.from_id);
      payload.retailer_id = parseInt(orderForm.to_id);
    } else if (activeTab === 'tertiary') {
      payload.retailer_id = parseInt(orderForm.from_id);
      payload.consumer_id = parseInt(orderForm.to_id);
    }

    const endpoint = activeTab === 'primary' ? '/primary-orders/'
                   : activeTab === 'secondary' ? '/secondary-sales/'
                   : '/tertiary-sales/';

    try {
      await api.post(endpoint, payload);
      toast.success('Order placed successfully!', { id: toastId });
      setIsOrderModalOpen(false);
      setOrderForm({ from_id: '', to_id: '', product_id: '', quantity: '' });
      fetchData();
    } catch (err) { toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId }); }
  };

  // --- MUTATIONS: ORDER STATUS ACTIONS ---
  const handleOrderStatus = async (action, orderId, tab) => {
    const toastId = toast.loading(`Processing action: ${action}...`);
    try {
      const baseRoute = tab === 'primary' ? 'primary-orders' : tab === 'secondary' ? 'secondary-sales' : 'tertiary-sales';

      if (action === 'cancel') {
        await api.put(`/${baseRoute}/${orderId}/cancel`);
      } else if (action === 'dispatch') {
        await api.post(`/${baseRoute}/${orderId}/dispatch`);
      } else if (action === 'receive') {
        await api.post(`/${baseRoute}/${orderId}/receive`);
      } else if (action === 'approve') {
        await api.patch(`/${baseRoute}/${orderId}/approve`);
      }

      toast.success(`Order ${action} successful!`, { id: toastId });
      fetchData();
    } catch (err) {
      toast.error(`Failed to ${action} order.`, { id: toastId });
    }
  };


  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-truck-fast text-primary me-2"></i> Supply Chain Order Hub
          </h3>
          <p className="text-muted m-0 mt-1">Manage Primary, Secondary, and Tertiary sales workflows.</p>
        </div>
        <div>
          {activeTab === 'consumers' ? (
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={() => { setEditingConsumerId(null); setConsumerForm({name:'', phone:'', address:''}); setIsConsumerModalOpen(true); }}>
              <i className="fa-solid fa-user-plus me-2"></i> Register End Consumer
            </button>
          ) : (
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => setIsOrderModalOpen(true)}>
              <i className="fa-solid fa-cart-plus me-2"></i> Place {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Order
            </button>
          )}
        </div>
      </div>

      {/* TIER NAVIGATION */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-2 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <div className="nav nav-pills p-1 bg-light rounded-pill w-100 d-flex text-center">
            <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'primary' ? 'active shadow-sm fw-bold' : 'text-dark'}`} onClick={() => setActiveTab('primary')}>
              <i className="fa-solid fa-industry me-1"></i> Primary (Factory <i className="fa-solid fa-arrow-right mx-1 small"></i> SS)
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'secondary' ? 'active shadow-sm fw-bold' : 'text-dark'}`} onClick={() => setActiveTab('secondary')}>
              <i className="fa-solid fa-truck-ramp-box me-1"></i> Secondary (DB <i className="fa-solid fa-arrow-right mx-1 small"></i> Retailer)
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'tertiary' ? 'active shadow-sm fw-bold' : 'text-dark'}`} onClick={() => setActiveTab('tertiary')}>
              <i className="fa-solid fa-shop me-1"></i> Tertiary (Retailer <i className="fa-solid fa-arrow-right mx-1 small"></i> Barber)
            </button>
            <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'consumers' ? 'active bg-dark text-white shadow-sm fw-bold' : 'text-dark'}`} onClick={() => setActiveTab('consumers')}>
              <i className="fa-solid fa-users me-1"></i> End Consumers
            </button>
          </div>
        </div>
      </div>

      {/* MAIN DATA GRID */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">

        {/* CONSUMERS VIEW */}
        {activeTab === 'consumers' && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Consumer ID</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Details</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Contact / Address</th>
                  <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                : consumers.length === 0 ? <tr><td colSpan="4" className="text-center py-5 text-muted fw-bold">No consumers registered.</td></tr>
                : consumers.map(c => (
                  <tr key={c.id}>
                    <td className="px-4"><code className="bg-light text-dark px-2 py-1 rounded">CUS-{c.id}</code></td>
                    <td className="fw-bolder text-dark">{c.name}</td>
                    <td>
                      <div className="small fw-semibold text-dark"><i className="fa-solid fa-phone text-muted me-2"></i>{c.phone}</div>
                      <div className="small text-muted"><i className="fa-solid fa-location-dot text-muted me-2"></i>{c.address || '-'}</div>
                    </td>
                    <td className="text-end px-4">
                      <button className="btn btn-light btn-sm rounded-circle me-2 text-primary shadow-sm" onClick={() => { setEditingConsumerId(c.id); setConsumerForm(c); setIsConsumerModalOpen(true); }}><i className="fa-solid fa-pen"></i></button>
                      <button className="btn btn-light btn-sm rounded-circle text-danger shadow-sm" onClick={() => handleDeleteConsumer(c.id, c.name)}><i className="fa-solid fa-trash"></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ORDERS VIEW (Primary, Secondary, Tertiary) */}
        {activeTab !== 'consumers' && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Order Ref</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Route (From <i className="fa-solid fa-arrow-right mx-1"></i> To)</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Product & Qty</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Status</th>
                  <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Workflow Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                : orders.length === 0 ? <tr><td colSpan="5" className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-receipt fs-2 mb-3 opacity-25 d-block"></i> No {activeTab} orders found.</td></tr>
                : orders.map(o => (
                  <tr key={o.id}>
                    <td className="px-4"><code className="bg-light text-dark px-2 py-1 rounded">ORD-{o.id}</code></td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-secondary bg-opacity-10 text-dark border rounded-pill px-3">
                          {activeTab === 'primary' ? 'Main Factory'
                           : activeTab === 'secondary' ? getPartnerName('distributor', o.distributor_id)
                           : getPartnerName('retailer', o.retailer_id)}
                        </span>
                        <i className="fa-solid fa-arrow-right-long text-muted opacity-50"></i>
                        <span className="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 rounded-pill px-3">
                          {activeTab === 'primary' ? getPartnerName('ss', o.ss_id)
                           : activeTab === 'secondary' ? getPartnerName('retailer', o.retailer_id)
                           : getPartnerName('consumer', o.consumer_id)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="fw-bolder text-dark">{getProductName(o.product_id)}</div>
                      <div className="small text-muted">{o.quantity} Units</div>
                    </td>
                    <td>
                      <span className={`badge rounded-pill px-3 py-2 text-uppercase ${
                        o.status === 'PENDING' ? 'bg-warning bg-opacity-10 text-warning' :
                        o.status === 'DISPATCHED' ? 'bg-info bg-opacity-10 text-info' :
                        o.status === 'RECEIVED' || o.status === 'APPROVED' ? 'bg-success bg-opacity-10 text-success' :
                        o.status === 'CANCELLED' ? 'bg-danger bg-opacity-10 text-danger' : 'bg-secondary bg-opacity-10 text-secondary'
                      }`}>
                        {o.status || 'LOGGED'}
                      </span>
                    </td>
                    <td className="text-end px-4">
                      {/* Dynamic Buttons based on status and tab */}
                      {o.status !== 'CANCELLED' && o.status !== 'RECEIVED' && o.status !== 'APPROVED' && (
                        <div className="dropdown">
                          <button className="btn btn-sm btn-light border rounded-pill shadow-sm px-3 fw-semibold dropdown-toggle" type="button" data-bs-toggle="dropdown">
                            Actions
                          </button>
                          <ul className="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3 mt-1">
                            {activeTab === 'primary' && o.status === 'PENDING' && <li><button className="dropdown-item text-primary fw-semibold" onClick={() => handleOrderStatus('dispatch', o.id, activeTab)}><i className="fa-solid fa-truck-fast me-2"></i> Dispatch Order</button></li>}
                            {activeTab === 'primary' && o.status === 'DISPATCHED' && <li><button className="dropdown-item text-success fw-semibold" onClick={() => handleOrderStatus('receive', o.id, activeTab)}><i className="fa-solid fa-box-open me-2"></i> Mark Received</button></li>}
                            {activeTab === 'tertiary' && o.status === 'PENDING' && <li><button className="dropdown-item text-success fw-semibold" onClick={() => handleOrderStatus('approve', o.id, activeTab)}><i className="fa-solid fa-check-double me-2"></i> Approve Sale</button></li>}

                            <li><hr className="dropdown-divider opacity-25" /></li>
                            <li><button className="dropdown-item text-danger fw-semibold" onClick={() => handleOrderStatus('cancel', o.id, activeTab)}><i className="fa-solid fa-ban me-2"></i> Cancel Order</button></li>
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- SMART MODAL: PLACE ORDER --- */}
      {isOrderModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleOrderSubmit}>
                <div className="modal-header bg-primary bg-gradient text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-cart-arrow-down me-2"></i> New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Order</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsOrderModalOpen(false)}></button>
                </div>

                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="row g-3">

                    {/* FROM: Varies by tab */}
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Dispatch From <span className="text-danger">*</span></label>
                      {activeTab === 'primary' ? (
                        <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2 bg-white" disabled value="Main Factory" />
                      ) : (
                        <select className="form-select border-0 shadow-sm rounded-3 py-2" required value={orderForm.from_id} onChange={e => setOrderForm({...orderForm, from_id: e.target.value})}>
                          <option value="" disabled>Select {activeTab === 'secondary' ? 'Distributor' : 'Retailer'}...</option>
                          {(activeTab === 'secondary' ? master.distributors : master.retailers).map(p => (
                            <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* TO: Varies by tab */}
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Deliver To <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2" required value={orderForm.to_id} onChange={e => setOrderForm({...orderForm, to_id: e.target.value})}>
                        <option value="" disabled>Select {activeTab === 'primary' ? 'Super Stockist' : activeTab === 'secondary' ? 'Retailer' : 'Consumer'}...</option>
                        {(activeTab === 'primary' ? master.ss : activeTab === 'secondary' ? master.retailers : master.consumers).map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name}</option>
                        ))}
                      </select>
                    </div>

                    {/* PRODUCT */}
                    <div className="col-md-8">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Select Product <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2" required value={orderForm.product_id} onChange={e => setOrderForm({...orderForm, product_id: e.target.value})}>
                        <option value="" disabled>Choose a product...</option>
                        {master.products.map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.product_name} (PRD-{p.id})</option>
                        ))}
                      </select>
                    </div>

                    {/* QUANTITY */}
                    <div className="col-md-4">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Quantity <span className="text-danger">*</span></label>
                      <input type="number" className="form-control border-0 shadow-sm rounded-3 py-2" required min="1" placeholder="Units" value={orderForm.quantity} onChange={e => setOrderForm({...orderForm, quantity: e.target.value})} />
                    </div>

                  </div>
                </div>

                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsOrderModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary fw-bold px-5 rounded-pill shadow-sm">Confirm Order</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: REGISTER CONSUMER --- */}
      {isConsumerModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleConsumerSubmit}>
                <div className={`modal-header bg-gradient text-white border-0 p-4 ${editingConsumerId ? 'bg-info' : 'bg-dark'}`}>
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-user-tag me-2"></i> {editingConsumerId ? 'Update' : 'Register'} End Consumer</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsConsumerModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Consumer Name / Shop <span className="text-danger">*</span></label>
                      <input type="text" className="form-control form-control-lg border-0 shadow-sm rounded-3" required value={consumerForm.name} onChange={e => setConsumerForm({...consumerForm, name: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Phone Number <span className="text-danger">*</span></label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2" required value={consumerForm.phone} onChange={e => setConsumerForm({...consumerForm, phone: e.target.value})} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Address / Location</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2" value={consumerForm.address} onChange={e => setConsumerForm({...consumerForm, address: e.target.value})} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsConsumerModalOpen(false)}>Cancel</button>
                  <button type="submit" className={`btn fw-bold px-5 rounded-pill shadow-sm ${editingConsumerId ? 'btn-info text-white' : 'btn-dark'}`}>Save Consumer</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}