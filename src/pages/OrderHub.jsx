import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext'; // <-- Imported AuthContext

export default function OrderHub() {
  const { user } = useContext(AuthContext); // <-- Grab the logged-in user

  // Initialize active tab based on role (Retailers shouldn't default to primary)
  const defaultTab = user?.role === 'Retailer' ? 'tertiary' : 'primary';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // --- HYDRATED MASTER DATA ---
  const [masterData, setMasterData] = useState({
    products: [], ss: [], distributors: [], retailers: [], consumers: []
  });

  // --- CASCADING GEO MASTER DATA (For Order Modal) ---
  const [geoMaster, setGeoMaster] = useState({
    zones: [], states: [], regions: [], areas: [], territories: []
  });

  const [geoFilter, setGeoFilter] = useState({
    zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: ''
  });

  // --- CASCADING GEO MASTER DATA (For Consumer Modal) ---
  const [consumerGeoMaster, setConsumerGeoMaster] = useState({
    states: [], regions: [], areas: [], territories: []
  });

  const [consumerGeoFilter, setConsumerGeoFilter] = useState({
    zone_id: '', state_id: '', region_id: '', area_id: ''
  });

  // --- CORE DATA STATES ---
  const [orders, setOrders] = useState([]);
  const [consumers, setConsumers] = useState([]);

  // --- MODAL STATES ---
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isConsumerModalOpen, setIsConsumerModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);

  const [shipmentDetails, setShipmentDetails] = useState(null);
  const [editingConsumerId, setEditingConsumerId] = useState(null);
  const [dispatchingOrderId, setDispatchingOrderId] = useState(null);

  // --- FORM STATES ---
  const [orderForm, setOrderForm] = useState({ from_id: '', to_id: '', product_id: '', quantity: '', batch_number: '' });
  const [consumerForm, setConsumerForm] = useState({ name: '', phone: '', address: '', territory_id: '' });
  const [dispatchForm, setDispatchForm] = useState({
    transporter_name: '', vehicle_number: '', lr_number: '', driver_phone: '', estimated_arrival_date: ''
  });

  const [primaryRouting, setPrimaryRouting] = useState('FACTORY_TO_SS');
  const [availableBatches, setAvailableBatches] = useState([]);

  // --- RBAC PERMISSION HELPERS ---
  const isAdminOrInternal = ['Admin', 'ZSM', 'RSM', 'ASM', 'SO'].includes(user?.role);

  const canViewPrimary = isAdminOrInternal || ['SuperStockist', 'Distributor'].includes(user?.role);
  const canViewSecondary = isAdminOrInternal || ['Distributor', 'Retailer'].includes(user?.role);
  const canViewTertiary = isAdminOrInternal || ['Retailer'].includes(user?.role);

  const canPlacePrimary = isAdminOrInternal || user?.role === 'SuperStockist' || user?.permissions?.includes('create_primary_order');
  const canPlaceSecondary = isAdminOrInternal || user?.role === 'Distributor' || user?.permissions?.includes('create_secondary_order');
  const canPlaceTertiary = isAdminOrInternal || user?.role === 'Retailer' || user?.permissions?.includes('create_tertiary_order');
  const canManageConsumers = isAdminOrInternal || user?.role === 'Retailer';

  // Determine if user can place order in CURRENT active tab
  const canPlaceOrderInCurrentTab =
    (activeTab === 'primary' && canPlacePrimary) ||
    (activeTab === 'secondary' && canPlaceSecondary) ||
    (activeTab === 'tertiary' && canPlaceTertiary);


  // --- 1. HYDRATION ON MOUNT ---
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [prod, ss, dist, ret, cons, zn] = await Promise.all([
          api.get('/products').catch(() => ({ data: [] })),
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] })),
          api.get('/tertiary-sales/consumers').catch(() => ({ data: [] })),
          api.get('/geo/zones').catch(() => ({ data: [] }))
        ]);

        setMasterData({
          products: Array.isArray(prod.data) ? prod.data : prod.data?.items || [],
          ss: Array.isArray(ss.data) ? ss.data : ss.data?.items || [],
          distributors: Array.isArray(dist.data) ? dist.data : dist.data?.items || [],
          retailers: Array.isArray(ret.data) ? ret.data : ret.data?.items || [],
          consumers: Array.isArray(cons.data) ? cons.data : cons.data?.items || []
        });

        setGeoMaster(prev => ({ ...prev, zones: Array.isArray(zn.data) ? zn.data : zn.data?.items || [] }));

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
        setMasterData(prev => ({ ...prev, consumers: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      } else {
        const endpoint = activeTab === 'primary' ? '/primary-orders/'
                       : activeTab === 'secondary' ? '/secondary-sales/'
                       : '/tertiary-sales/';
        const res = await api.get(endpoint).catch(() => ({ data: [] }));
        setOrders(Array.isArray(res.data) ? res.data : res.data.items || res.data.orders || []);
      }
    } catch (err) {
      toast.error(`Failed to load ${activeTab} data.`);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

  // --- 3. DYNAMIC BATCH FETCHING LOGIC ---
  useEffect(() => {
    const fetchAvailableBatches = async () => {
      if (!orderForm.product_id) return setAvailableBatches([]);
      let entityId = activeTab === 'primary' && primaryRouting.startsWith('FACTORY') ? 1 : orderForm.from_id;
      if (!entityId) return;

      let endpoint = activeTab === 'primary' ? (primaryRouting === 'SS_TO_DB' ? `/inventory/ss/${entityId}` : `/inventory/factory/${entityId}`)
                   : activeTab === 'secondary' ? `/inventory/distributor/${entityId}`
                   : `/inventory/retailer/${entityId}`;

      try {
        const res = await api.get(endpoint);
        const stockList = Array.isArray(res.data) ? res.data : res.data.items || [];
        const productBatches = stockList.filter(s => s.product_id === parseInt(orderForm.product_id) && ((s.current_stock || 0) > 0 || (s.current_stock_qty || 0) > 0));
        setAvailableBatches(productBatches);
        setOrderForm(prev => ({ ...prev, batch_number: productBatches.length === 1 ? productBatches[0].batch_number : '' }));
      } catch (err) { setAvailableBatches([]); }
    };
    fetchAvailableBatches();
  }, [orderForm.product_id, orderForm.from_id, activeTab, primaryRouting]);

  // --- 4. TARGET IDENTIFICATION ---
  const getTargetTier = () => {
    if (activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS') return 'ss';
    if (activeTab === 'primary' && (primaryRouting === 'FACTORY_TO_DB' || primaryRouting === 'SS_TO_DB')) return 'distributor';
    if (activeTab === 'secondary') return 'retailer';
    if (activeTab === 'tertiary') return 'consumer';
    return null;
  };

  // --- 5. HIERARCHICAL CASCADING API FETCHERS ---
  const handleGeoChange = async (field, value) => {
    setOrderForm(prev => ({ ...prev, to_id: '' })); // Reset destination

    if (field === 'zone_id') {
      setGeoFilter({ zone_id: value, state_id: '', region_id: '', area_id: '', territory_id: '' });
      setGeoMaster(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/zones/${value}/states`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, states: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'state_id') {
      setGeoFilter(prev => ({ ...prev, state_id: value, region_id: '', area_id: '', territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/states/${value}/regions`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, regions: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'region_id') {
      setGeoFilter(prev => ({ ...prev, region_id: value, area_id: '', territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/regions/${value}/areas`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, areas: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'area_id') {
      setGeoFilter(prev => ({ ...prev, area_id: value, territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, territories: [] }));
      if (value) {
        const res = await api.get(`/geo/areas/${value}/territories`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, territories: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'territory_id') {
      setGeoFilter(prev => ({ ...prev, territory_id: value }));
    }
  };

  const handleConsumerGeoChange = async (field, value) => {
    if (field === 'zone_id') {
      setConsumerGeoFilter({ zone_id: value, state_id: '', region_id: '', area_id: '' });
      setConsumerForm(prev => ({ ...prev, territory_id: '' }));
      setConsumerGeoMaster({ states: [], regions: [], areas: [], territories: [] });
      if (value) {
        const res = await api.get(`/geo/zones/${value}/states`).catch(() => ({ data: [] }));
        setConsumerGeoMaster(prev => ({ ...prev, states: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'state_id') {
      setConsumerGeoFilter(prev => ({ ...prev, state_id: value, region_id: '', area_id: '' }));
      setConsumerForm(prev => ({ ...prev, territory_id: '' }));
      setConsumerGeoMaster(prev => ({ ...prev, regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/states/${value}/regions`).catch(() => ({ data: [] }));
        setConsumerGeoMaster(prev => ({ ...prev, regions: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'region_id') {
      setConsumerGeoFilter(prev => ({ ...prev, region_id: value, area_id: '' }));
      setConsumerForm(prev => ({ ...prev, territory_id: '' }));
      setConsumerGeoMaster(prev => ({ ...prev, areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/regions/${value}/areas`).catch(() => ({ data: [] }));
        setConsumerGeoMaster(prev => ({ ...prev, areas: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
    else if (field === 'area_id') {
      setConsumerGeoFilter(prev => ({ ...prev, area_id: value }));
      setConsumerForm(prev => ({ ...prev, territory_id: '' }));
      setConsumerGeoMaster(prev => ({ ...prev, territories: [] }));
      if (value) {
        const res = await api.get(`/geo/areas/${value}/territories`).catch(() => ({ data: [] }));
        setConsumerGeoMaster(prev => ({ ...prev, territories: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      }
    }
  };

  // --- 6. EXACT MODEL-BASED GEOFENCING ---
  const getFilteredDestinations = () => {
    const targetTier = getTargetTier();

    if (!orderForm.from_id && !(activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))) return [];

    if (targetTier === 'ss') {
        let list = masterData.ss;
        if (geoFilter.zone_id) list = list.filter(s => s.zone_id === parseInt(geoFilter.zone_id));
        return list;
    }
    else if (targetTier === 'distributor') {
        let list = masterData.distributors;
        if (geoFilter.state_id) list = list.filter(d => d.state_id === parseInt(geoFilter.state_id));
        return list;
    }
    else if (targetTier === 'retailer') {
        let list = masterData.retailers;
        if (geoFilter.territory_id) list = list.filter(r => r.territory_id === parseInt(geoFilter.territory_id));
        return list;
    }
    else if (targetTier === 'consumer') {
        let list = masterData.consumers;
        if (geoFilter.territory_id) list = list.filter(c => c.territory_id === parseInt(geoFilter.territory_id));
        return list;
    }

    return [];
  };

  const filteredDestinations = getFilteredDestinations();

  // --- HELPERS: ID TRANSLATORS ---
  const getProductName = (id) => {
    const p = masterData.products.find(x => x.id === parseInt(id));
    return p ? p.name || p.product_name : `PRD-${id}`;
  };

  const getPartnerName = (tier, id) => {
    if (!id) return '-';
    let list = [];
    if (tier === 'ss') list = masterData.ss;
    if (tier === 'distributor') list = masterData.distributors;
    if (tier === 'retailer') list = masterData.retailers;
    if (tier === 'consumer') list = masterData.consumers;

    const p = list.find(x => x.id === parseInt(id));
    if (!p) return `ID: ${id}`;
    return p.name || p.firm_name || p.shop_name;
  };

  // --- MUTATIONS: CONSUMERS ---
  const handleConsumerSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading(editingConsumerId ? 'Updating consumer...' : 'Registering consumer...');
    try {
      const payload = {
        name: consumerForm.name,
        mobile_number: consumerForm.phone,
        address: consumerForm.address,
        territory_id: parseInt(consumerForm.territory_id),
        type: "Consumer"
      };
      if (editingConsumerId) {
        await api.patch(`/tertiary-sales/consumers/${editingConsumerId}`, consumerForm);
        toast.success('Consumer profile updated', { id: toastId });
      } else {
        await api.post('/tertiary-sales/consumers', consumerForm);
        toast.success('Consumer registered successfully', { id: toastId });
      }
      setIsConsumerModalOpen(false);
      setConsumerForm({ name: '', phone: '', address: '', territory_id: '' });
      setConsumerGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '' });
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

  // --- MUTATIONS: SMART DYNAMIC ORDERS ---
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading(`Routing ${activeTab} order...`);

    const generatedOrderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    let payload = {};
    let endpoint = '';

    if (activeTab === 'primary') {
      endpoint = '/primary-orders/';
      let senderId = 1;
      if (primaryRouting === 'SS_TO_DB') senderId = parseInt(orderForm.from_id);

      payload = {
        order_number: generatedOrderNumber,
        type: primaryRouting,
        from_entity_id: senderId,
        to_entity_id: parseInt(orderForm.to_id),
        items: [{ product_id: parseInt(orderForm.product_id), quantity: parseInt(orderForm.quantity), batch_number: orderForm.batch_number }]
      };
    } else if (activeTab === 'secondary') {
      endpoint = '/secondary-sales/';
      payload = {
        distributor_id: parseInt(orderForm.from_id),
        retailer_id: parseInt(orderForm.to_id),
        items: [{ product_id: parseInt(orderForm.product_id), quantity: parseInt(orderForm.quantity), batch_number: orderForm.batch_number }]
      };
    } else if (activeTab === 'tertiary') {
      endpoint = '/tertiary-sales/';
      payload = {
        end_consumer_id: parseInt(orderForm.to_id),
        fulfilled_by_retailer_id: parseInt(orderForm.from_id),
        assigned_so_id: 1,
        product_id: parseInt(orderForm.product_id),
        quantity: parseInt(orderForm.quantity),
        batch_number: orderForm.batch_number
      };
    }

    try {
      await api.post(endpoint, payload);
      toast.success('Order placed successfully!', { id: toastId });
      setIsOrderModalOpen(false);
      setOrderForm({ from_id: '', to_id: '', product_id: '', quantity: '', batch_number: '' });
      setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });
      fetchData();
    } catch (err) {
      let errorMsg = err.response?.data?.detail || err.message;
      if (Array.isArray(errorMsg)) {
        errorMsg = errorMsg.map(d => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(' | ');
      }
      toast.error(`Validation Error: ${errorMsg}`, { id: toastId });
    }
  };

  // --- MUTATIONS: DISPATCH LOGISTICS ---
  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Dispatching order to logistics...');

    try {
      const baseRoute = activeTab === 'primary' ? 'primary-orders' : activeTab === 'secondary' ? 'secondary-sales' : 'tertiary-sales';
      const payload = { ...dispatchForm };
      if (!payload.driver_phone) delete payload.driver_phone;

      await api.post(`/${baseRoute}/${dispatchingOrderId}/dispatch`, payload);
      toast.success('Order dispatched successfully!', { id: toastId });
      setIsDispatchModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(`Dispatch failed: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  // --- MUTATIONS: SIMPLE WORKFLOW ACTIONS ---
  const handleOrderStatus = async (action, orderId) => {
    setOpenDropdownId(null);
    const toastId = toast.loading(`Processing workflow: ${action}...`);
    try {
      const baseRoute = activeTab === 'primary' ? 'primary-orders' : activeTab === 'secondary' ? 'secondary-sales' : 'tertiary-sales';

      if (action === 'cancel') await api.put(`/${baseRoute}/${orderId}/cancel`);
      else if (action === 'receive') await api.post(`/${baseRoute}/${orderId}/receive`);
      else if (action === 'approve') await api.patch(`/${baseRoute}/${orderId}/approve`);

      toast.success(`Order ${action} executed!`, { id: toastId });
      fetchData();
    } catch (err) {
      toast.error(`Action failed: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f4f7f8', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-truck-fast text-primary me-2"></i> Supply Chain Hub
          </h3>
          <p className="text-muted m-0 mt-1">Manage Primary, Secondary, and Tertiary distribution funnels.</p>
        </div>
        <div>
          {/* DYNAMIC NEW ORDER / REGISTRATION BUTTONS */}
          {activeTab === 'consumers' && canManageConsumers ? (
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={() => {
              setEditingConsumerId(null);
              setConsumerForm({name:'', phone:'', address:'', territory_id:''});
              setConsumerGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '' });
              setIsConsumerModalOpen(true);
            }}>
              <i className="fa-solid fa-user-plus me-2"></i> Register Barber / Consumer
            </button>
          ) : activeTab !== 'consumers' && canPlaceOrderInCurrentTab ? (
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={() => {
              setOrderForm({ from_id: '', to_id: '', product_id: '', quantity: '', batch_number: '' });
              setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });
              setIsOrderModalOpen(true);
            }}>
              <i className="fa-solid fa-cart-plus me-2"></i> Place {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Order
            </button>
          ) : null}
        </div>
      </div>

      {/* TIER NAVIGATION (RBAC FILTERED) */}
      <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white">
        <div className="card-body p-2 d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
          <div className="nav nav-pills p-1 bg-light rounded-pill w-100 d-flex text-center shadow-sm border border-light">

            {canViewPrimary && (
              <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'primary' ? 'active bg-primary shadow text-white fw-bold' : 'text-muted fw-semibold hover-bg-white'}`} onClick={() => setActiveTab('primary')}>
                <i className="fa-solid fa-industry me-2"></i> Primary <span className="opacity-75 ms-1 fw-normal">(Factory / SS)</span>
              </button>
            )}

            {canViewSecondary && (
              <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'secondary' ? 'active bg-success shadow text-white fw-bold' : 'text-muted fw-semibold hover-bg-white'}`} onClick={() => setActiveTab('secondary')}>
                <i className="fa-solid fa-truck-ramp-box me-2"></i> Secondary <span className="opacity-75 ms-1 fw-normal">(DB <i className="fa-solid fa-arrow-right mx-1 small"></i> Retailer)</span>
              </button>
            )}

            {canViewTertiary && (
              <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'tertiary' ? 'active bg-warning shadow text-dark fw-bold' : 'text-muted fw-semibold hover-bg-white'}`} onClick={() => setActiveTab('tertiary')}>
                <i className="fa-solid fa-shop me-2"></i> Tertiary <span className="opacity-75 ms-1 fw-normal">(Retailer <i className="fa-solid fa-arrow-right mx-1 small"></i> Barber)</span>
              </button>
            )}

            {canViewTertiary && (
              <button className={`nav-link rounded-pill flex-grow-1 ${activeTab === 'consumers' ? 'active bg-dark shadow text-white fw-bold' : 'text-muted fw-semibold hover-bg-white'}`} onClick={() => setActiveTab('consumers')}>
                <i className="fa-solid fa-users me-2"></i> Consumers
              </button>
            )}

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
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Registry ID</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Identity Details</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Contact Info</th>
                  {canManageConsumers && <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="4" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                : consumers.length === 0 ? <tr><td colSpan="4" className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-users-slash fs-1 opacity-25 d-block mb-3"></i> No consumers registered.</td></tr>
                : consumers.map(c => (
                  <tr key={c.id}>
                    <td className="px-4"><code className="bg-dark bg-opacity-10 text-dark px-2 py-1 rounded border">CUS-{c.id}</code></td>
                    <td>
                      <div className="d-flex align-items-center">
                        <div className="bg-info bg-opacity-10 text-info rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '40px', height: '40px' }}><i className="fa-solid fa-user"></i></div>
                        <div>
                           <div className="fw-bolder text-dark fs-6">{c.name}</div>
                           <span className="badge bg-light text-muted border px-2 py-1 mt-1" style={{fontSize: '0.65rem'}}>Territory ID: {c.territory_id}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="small fw-semibold text-dark mb-1"><i className="fa-solid fa-phone text-primary me-2"></i>{c.phone}</div>
                      <div className="small text-muted"><i className="fa-solid fa-location-dot text-danger me-2"></i>{c.address || 'Address not logged'}</div>
                    </td>
                    {canManageConsumers && (
                      <td className="text-end px-4">
                        <button className="btn btn-light btn-sm rounded-circle me-2 text-primary shadow-sm border border-primary border-opacity-25" onClick={() => { setEditingConsumerId(c.id); setConsumerForm(c); setIsConsumerModalOpen(true); }}><i className="fa-solid fa-pen"></i></button>
                        <button className="btn btn-light btn-sm rounded-circle text-danger shadow-sm border border-danger border-opacity-25" onClick={() => handleDeleteConsumer(c.id, c.name)}><i className="fa-solid fa-trash"></i></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ORDERS VIEW */}
        {activeTab !== 'consumers' && (
          <div className="table-responsive" style={{ minHeight: '300px' }}>
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Order Ref</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Routing Vector</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Payload Info</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Pipeline Status</th>
                  <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Workflow Engine</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                : orders.length === 0 ? <tr><td colSpan="5" className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-receipt fs-1 mb-3 opacity-25 d-block"></i> No {activeTab} pipeline data found.</td></tr>
                : orders.map(o => {

                  const destId = o.to_entity_id || o.ss_id || o.retailer_id || o.consumer_id;
                  let targetTier = 'consumer';
                  if (activeTab === 'primary') {
                    targetTier = (o.type === 'FACTORY_TO_DB' || o.type === 'SS_TO_DB') ? 'distributor' : 'ss';
                  } else if (activeTab === 'secondary') {
                    targetTier = 'retailer';
                  }

                  const destName = destId
                    ? getPartnerName(targetTier, destId)
                    : 'Destination Pending...';

                  // Origin Naming logic
                  let originName = '🏭 Main Factory';
                  if (activeTab === 'primary' && o.type === 'SS_TO_DB') {
                      originName = getPartnerName('ss', o.from_entity_id);
                  } else if (activeTab === 'secondary') {
                      originName = getPartnerName('distributor', o.from_entity_id || o.distributor_id);
                  } else if (activeTab === 'tertiary') {
                      originName = getPartnerName('retailer', o.from_entity_id || o.retailer_id);
                  }

                  const itemInfo = o.items && o.items.length > 0 ? o.items[0] : null;
                  const prodId = itemInfo ? itemInfo.product_id : o.product_id;
                  const qty = itemInfo ? (itemInfo.quantity_cases || itemInfo.quantity) : o.quantity;
                  const batch = itemInfo ? itemInfo.batch_number : o.batch_number;

                  const isDispatched = (o.status === 'DISPATCHED' || o.status === 'Dispatched' || o.status === 'Partially Dispatched');

                  // Role checks for actions
                  const canDispatch = isAdminOrInternal || (activeTab === 'primary' && user?.role === 'SuperStockist') || (activeTab === 'secondary' && user?.role === 'Distributor');
                  const canReceive = isAdminOrInternal || (activeTab === 'primary' && ['SuperStockist', 'Distributor'].includes(user?.role)) || (activeTab === 'secondary' && user?.role === 'Retailer');
                  const canApproveTertiary = isAdminOrInternal || user?.role === 'Retailer';

                  return (
                  <tr key={o.id}>
                    <td className="px-4">
                      <code className="bg-dark bg-opacity-10 text-dark px-2 py-1 rounded fw-bold border">
                        {o.order_number || `ORD-${o.id}`}
                      </code>
                    </td>
                    <td>
                      <div className="d-flex align-items-center bg-light rounded-pill px-2 py-1 d-inline-flex border">
                        <span className="badge bg-white text-dark border shadow-sm rounded-pill px-3">
                          {originName}
                        </span>
                        <i className="fa-solid fa-arrow-right-long text-muted opacity-50 mx-2"></i>
                        <span className={`badge border shadow-sm rounded-pill px-3 ${!destId ? 'bg-secondary bg-opacity-10 text-secondary border-secondary' : activeTab === 'primary' ? 'bg-primary bg-opacity-10 text-primary border-primary' : activeTab === 'secondary' ? 'bg-success bg-opacity-10 text-success border-success' : 'bg-warning bg-opacity-10 text-dark border-warning'}`}>
                          {destName}
                        </span>
                      </div>
                    </td>
                    <td>
                      {prodId ? (
                        <>
                          <div className="fw-bolder text-dark">{getProductName(prodId)}</div>
                          <div className="small text-muted fw-semibold">
                            {qty || 0} Units
                            {batch && <span className="ms-2 badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill">Batch: {batch}</span>}
                          </div>
                        </>
                      ) : (
                        <div className="text-muted small fst-italic">
                          <i className="fa-solid fa-hourglass-half me-1"></i> Awaiting Payload Data...
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge rounded-pill px-3 py-2 text-uppercase shadow-sm border ${
                        o.status === 'Pending' || o.status === 'PENDING' ? 'bg-warning bg-opacity-10 text-warning border-warning border-opacity-50' :
                        isDispatched ? 'bg-info bg-opacity-10 text-info border-info border-opacity-50' :
                        o.status === 'RECEIVED' || o.status === 'Received' || o.status === 'APPROVED' ? 'bg-success bg-opacity-10 text-success border-success border-opacity-50' :
                        o.status === 'CANCELLED' || o.status === 'Cancelled' ? 'bg-danger bg-opacity-10 text-danger border-danger border-opacity-50' : 'bg-secondary bg-opacity-10 text-secondary border-secondary border-opacity-50'
                      }`}>
                        <i className={`fa-solid ${o.status === 'Pending' || o.status === 'PENDING' ? 'fa-clock' : isDispatched ? 'fa-truck-fast' : o.status === 'RECEIVED' || o.status === 'Received' || o.status === 'APPROVED' ? 'fa-check-double' : 'fa-ban'} me-1`}></i>
                        {o.status || 'LOGGED'}
                      </span>
                    </td>
                    <td className="text-end px-4">
                      {(o.status === 'Pending' || o.status === 'PENDING' || isDispatched) ? (
                        <div className="dropdown position-relative">
                          <button
                            className="btn btn-sm btn-dark rounded-pill shadow-sm px-3 fw-bold dropdown-toggle"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === o.id ? null : o.id);
                            }}
                          >
                            <i className="fa-solid fa-bolt me-1 text-warning"></i> Action
                          </button>

                          <ul
                            className={`dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-4 mt-1 p-2 ${openDropdownId === o.id ? 'show' : ''}`}
                            style={{ position: 'absolute', right: 0, top: '100%', zIndex: 1050 }}
                          >
                            {/* DISPATCH ACTION */}
                            {canDispatch && (activeTab === 'primary' || activeTab === 'secondary') && (o.status === 'Pending' || o.status === 'PENDING') &&
                              <li>
                                <button className="dropdown-item rounded-3 text-info fw-bold py-2 mb-1"
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    setDispatchingOrderId(o.id);
                                    setDispatchForm({
                                      transporter_name: '',
                                      vehicle_number: '',
                                      lr_number: `LR-${Date.now().toString().slice(-6)}`,
                                      driver_phone: '',
                                      estimated_arrival_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]
                                    });
                                    setIsDispatchModalOpen(true);
                                  }}>
                                  <div className="bg-info bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className="fa-solid fa-truck-fast text-info"></i></div>
                                  Dispatch Logistics
                                </button>
                              </li>
                            }

                            {/* VIEW DISPATCH DETAILS */}
                            {isDispatched && o.shipment && (
                              <li>
                                <button className="dropdown-item rounded-3 text-primary fw-bold py-2 mb-1"
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    setShipmentDetails(o.shipment);
                                    setIsShipmentModalOpen(true);
                                  }}>
                                  <div className="bg-primary bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className="fa-solid fa-eye text-primary"></i></div>
                                  View Logistics
                                </button>
                              </li>
                            )}

                            {/* Receive Action */}
                            {canReceive && (activeTab === 'primary' || activeTab === 'secondary') && isDispatched &&
                              <li><button className="dropdown-item rounded-3 text-success fw-bold py-2 mb-1" onClick={() => handleOrderStatus('receive', o.id)}><div className="bg-success bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className="fa-solid fa-box-open text-success"></i></div> Mark Received</button></li>
                            }

                            {/* Approve Action */}
                            {canApproveTertiary && activeTab === 'tertiary' && (o.status === 'Pending' || o.status === 'PENDING') &&
                              <li><button className="dropdown-item rounded-3 text-success fw-bold py-2 mb-1" onClick={() => handleOrderStatus('approve', o.id)}><div className="bg-success bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className="fa-solid fa-check text-success"></i></div> Approve Sale</button></li>
                            }

                            <li><hr className="dropdown-divider opacity-10 m-1" /></li>
                            <li><button className="dropdown-item rounded-3 text-danger fw-bold py-2" onClick={() => handleOrderStatus('cancel', o.id)}><i className="fa-solid fa-ban text-danger me-3 ms-1"></i> Abort / Cancel</button></li>
                          </ul>
                        </div>
                      ) : (
                        <span className="text-muted small fw-semibold fst-italic"><i className="fa-solid fa-lock me-1"></i> Locked</span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL: PLACE ORDER --- */}
      {isOrderModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleOrderSubmit}>
                <div className={`modal-header bg-gradient text-white border-0 p-4 ${activeTab === 'primary' ? 'bg-primary' : activeTab === 'secondary' ? 'bg-success' : 'bg-warning text-dark'}`}>
                  <div className="d-flex align-items-center">
                    <div className="bg-white bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '45px', height: '45px' }}>
                      <i className="fa-solid fa-cart-arrow-down fs-5"></i>
                    </div>
                    <h5 className="modal-title fw-bold m-0">Initialize {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Route</h5>
                  </div>
                  <button type="button" className={`btn-close ${activeTab === 'tertiary' ? '' : 'btn-close-white'} opacity-75`} onClick={() => setIsOrderModalOpen(false)}></button>
                </div>

                <div className="modal-body p-4 bg-light">
                  <div className="row g-4">

                    {/* PRIMARY ROUTING VECTOR SELECTOR */}
                    {activeTab === 'primary' && (
                      <div className="col-12 mb-2">
                        <label className="form-label small fw-bold text-uppercase text-muted mb-2">Primary Route Vector <span className="text-danger">*</span></label>
                        <div className="btn-group w-100 shadow-sm" role="group">
                          <button type="button" className={`btn ${primaryRouting === 'FACTORY_TO_SS' ? 'btn-primary fw-bold' : 'btn-white bg-white text-muted border'}`} onClick={() => { setPrimaryRouting('FACTORY_TO_SS'); setOrderForm({...orderForm, from_id: '', to_id: ''}); setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' }); }}>🏭 Factory ➝ 🏢 Super Stockist</button>
                          <button type="button" className={`btn ${primaryRouting === 'FACTORY_TO_DB' ? 'btn-primary fw-bold' : 'btn-white bg-white text-muted border'}`} onClick={() => { setPrimaryRouting('FACTORY_TO_DB'); setOrderForm({...orderForm, from_id: '', to_id: ''}); setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' }); }}>🏭 Factory ➝ 🚚 Distributor</button>
                          <button type="button" className={`btn ${primaryRouting === 'SS_TO_DB' ? 'btn-primary fw-bold' : 'btn-white bg-white text-muted border'}`} onClick={() => { setPrimaryRouting('SS_TO_DB'); setOrderForm({...orderForm, from_id: '', to_id: ''}); setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' }); }}>🏢 Super Stockist ➝ 🚚 Distributor</button>
                        </div>
                      </div>
                    )}

                    {/* 1. DISPATCH ORIGIN */}
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Dispatch Origin <span className="text-danger">*</span></label>

                      {activeTab === 'primary' && primaryRouting.startsWith('FACTORY') ? (
                        <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                          <span className="input-group-text bg-light border-0"><i className="fa-solid fa-industry text-muted"></i></span>
                          <input type="text" className="form-control py-2 border-0 bg-light text-muted fw-bold" disabled value="Main Factory Plant (ID: 1)" />
                        </div>
                      ) : (
                        <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                          <span className="input-group-text bg-white border-0"><i className={`fa-solid ${activeTab === 'secondary' ? 'fa-truck-fast text-success' : 'fa-building text-primary'}`}></i></span>
                          <select
                            className="form-select border-0 shadow-none py-2 fw-semibold"
                            required
                            value={orderForm.from_id}
                            onChange={e => {
                              // Reset Destination when Origin changes
                              setOrderForm({...orderForm, from_id: e.target.value, to_id: '', batch_number: ''});
                            }}
                          >
                            <option value="" disabled>Select Origin Sender...</option>
                            {activeTab === 'primary' && primaryRouting === 'SS_TO_DB' && masterData.ss.map(p => <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>)}
                            {activeTab === 'secondary' && masterData.distributors.map(p => <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>)}
                            {activeTab === 'tertiary' && masterData.retailers.map(p => <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* 2. DYNAMIC CASCADING GEO FILTER (Conditional rendering based on target tier) */}
                    {(orderForm.from_id || (activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))) && (
                      <div className="col-12 p-3 bg-white rounded-4 shadow-sm border">
                        <label className="form-label small fw-bold text-uppercase text-primary mb-2"><i className="fa-solid fa-earth-asia me-2"></i> Find Target by Geography</label>
                        <div className="row g-2">

                          {/* ALL TARGETS NEED ZONE */}
                          <div className="col-md-3">
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={geoFilter.zone_id} onChange={e => handleGeoChange('zone_id', e.target.value)}>
                              <option value="">Select Zone</option>
                              {geoMaster.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                            </select>
                          </div>

                          {/* DISTRIBUTORS, RETAILERS, CONSUMERS NEED STATE */}
                          {(getTargetTier() === 'distributor' || getTargetTier() === 'retailer' || getTargetTier() === 'consumer') && (
                            <div className="col-md-3">
                              <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={geoFilter.state_id} onChange={e => handleGeoChange('state_id', e.target.value)} disabled={!geoFilter.zone_id}>
                                <option value="">Select State</option>
                                {geoMaster.states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          )}

                          {/* ONLY RETAILERS & CONSUMERS NEED REGION, AREA, TERRITORY */}
                          {(getTargetTier() === 'retailer' || getTargetTier() === 'consumer') && (
                            <>
                              <div className="col-md-3">
                                <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={geoFilter.region_id} onChange={e => handleGeoChange('region_id', e.target.value)} disabled={!geoFilter.state_id}>
                                  <option value="">Select Region</option>
                                  {geoMaster.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                              </div>
                              <div className="col-md-3">
                                <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={geoFilter.area_id} onChange={e => handleGeoChange('area_id', e.target.value)} disabled={!geoFilter.region_id}>
                                  <option value="">Select Area</option>
                                  {geoMaster.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                              </div>
                              <div className="col-md-3 mt-2">
                                <select className="form-select form-select-sm border bg-light shadow-none fw-semibold border-primary text-primary" value={geoFilter.territory_id} onChange={e => handleGeoChange('territory_id', e.target.value)} disabled={!geoFilter.area_id}>
                                  <option value="">Select Target Territory</option>
                                  {geoMaster.territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3. DELIVERY DESTINATION */}
                    <div className="col-12 mt-2">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Delivery Destination <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0"><i className={`fa-solid ${activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS' ? 'fa-building text-primary' : activeTab === 'primary' || activeTab === 'secondary' ? 'fa-truck-fast text-success' : 'fa-user text-warning'}`}></i></span>
                        <select
                          className="form-select border-0 shadow-none py-2 fw-bold"
                          required
                          value={orderForm.to_id}
                          onChange={e => setOrderForm({...orderForm, to_id: e.target.value})}
                          disabled={!orderForm.from_id && !(activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))}
                        >

                          <option value="" disabled>Select Target Destination...</option>

                          {/* RENDER DYNAMICALLY FILTERED DESTINATIONS */}
                          {filteredDestinations.map(p => (
                            <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>
                          ))}

                        </select>
                      </div>

                      {/* Empty state warning */}
                      {filteredDestinations.length === 0 && (orderForm.from_id || (activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))) && (
                        <div className="form-text text-danger mt-1 small" style={{fontSize: '0.75rem'}}>
                          <i className="fa-solid fa-triangle-exclamation me-1"></i> No partners found in the selected geographical area. Please adjust filters.
                        </div>
                      )}
                    </div>

                    {/* TARGET PAYLOAD */}
                    <div className="col-md-5">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Target Payload (SKU) <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0"><i className="fa-solid fa-box text-dark"></i></span>
                        <select className="form-select border-0 shadow-none py-2 fw-semibold text-dark" required value={orderForm.product_id} onChange={e => setOrderForm({...orderForm, product_id: e.target.value, batch_number: ''})}>
                          <option value="" disabled>Choose a product SKU...</option>
                          {masterData.products.map(p => (
                            <option key={p.id} value={p.id}>{p.name || p.product_name} (PRD-{p.id})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Batch ID <span className="text-danger">*</span></label>
                      <div className={`input-group ${!orderForm.product_id ? 'bg-light' : 'bg-white'} rounded-3 shadow-sm border overflow-hidden`}>
                        <span className="input-group-text bg-transparent border-0"><i className="fa-solid fa-barcode text-muted"></i></span>
                        <select
                          className="form-select border-0 shadow-none py-2 fw-bold text-uppercase text-primary bg-transparent"
                          required
                          value={orderForm.batch_number}
                          onChange={e => setOrderForm({...orderForm, batch_number: e.target.value})}
                          disabled={!orderForm.product_id || (availableBatches.length === 0 && orderForm.product_id !== '')}
                        >
                          <option value="" disabled>Select Batch...</option>
                          {availableBatches.length === 0 && orderForm.product_id ? (
                             <option value="" disabled>No stock available</option>
                          ) : (
                            availableBatches.map((b, idx) => {
                              const qty = b.current_stock ?? b.current_stock_qty ?? 0;
                              return (
                                <option key={idx} value={b.batch_number}>
                                  {b.batch_number || 'UNKNOWN'} ({qty} left)
                                </option>
                              )
                            })
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="col-md-3">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Units <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                        <span className="input-group-text bg-white border-0"><i className="fa-solid fa-hashtag text-muted"></i></span>
                        <input type="number" className="form-control border-0 shadow-none py-2 fw-bold text-primary fs-5 px-1" required min="1" placeholder="0" value={orderForm.quantity} onChange={e => setOrderForm({...orderForm, quantity: e.target.value})} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-0 p-4 bg-white shadow-sm" style={{ zIndex: 10 }}>
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsOrderModalOpen(false)}>Abort</button>
                  <button type="submit" className={`btn fw-bold px-5 rounded-pill shadow-sm bg-gradient ${activeTab === 'primary' ? 'btn-primary' : activeTab === 'secondary' ? 'btn-success' : 'btn-warning text-dark'}`}>
                    <i className="fa-solid fa-satellite-dish me-2"></i> Transmit Order
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: DISPATCH LOGISTICS DETAILS (Input Form) --- */}
      {isDispatchModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1070 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleDispatchSubmit}>
                <div className="modal-header bg-info bg-gradient text-white border-0 p-4">
                  <div className="d-flex align-items-center">
                    <div className="bg-white bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '45px', height: '45px' }}>
                      <i className="fa-solid fa-truck-fast fs-5"></i>
                    </div>
                    <h5 className="modal-title fw-bold m-0">Logistics & Dispatch Details</h5>
                  </div>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsDispatchModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Transporter / Agency Name <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-building"></i></span>
                         <input type="text" className="form-control border-0 shadow-none fw-semibold" placeholder="e.g. Mumbai to Baddi Logistics" required value={dispatchForm.transporter_name} onChange={e => setDispatchForm({...dispatchForm, transporter_name: e.target.value})} />
                      </div>
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Vehicle Number <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-car-side"></i></span>
                         <input type="text" className="form-control border-0 shadow-none fw-semibold text-uppercase" placeholder="MH-01-AB-1234" required value={dispatchForm.vehicle_number} onChange={e => setDispatchForm({...dispatchForm, vehicle_number: e.target.value})} />
                      </div>
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">LR Number <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-file-invoice"></i></span>
                         <input type="text" className="form-control border-0 shadow-none fw-semibold text-uppercase" required value={dispatchForm.lr_number} onChange={e => setDispatchForm({...dispatchForm, lr_number: e.target.value})} />
                      </div>
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Estimated Arrival <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-calendar-day"></i></span>
                         <input type="date" className="form-control border-0 shadow-none fw-semibold" required value={dispatchForm.estimated_arrival_date} onChange={e => setDispatchForm({...dispatchForm, estimated_arrival_date: e.target.value})} />
                      </div>
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Driver Phone</label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-phone"></i></span>
                         <input type="text" className="form-control border-0 shadow-none fw-semibold" placeholder="Optional" value={dispatchForm.driver_phone} onChange={e => setDispatchForm({...dispatchForm, driver_phone: e.target.value})} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsDispatchModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-info fw-bold text-white px-5 rounded-pill shadow-sm bg-gradient">
                    <i className="fa-solid fa-truck-ramp-box me-2"></i> Confirm Dispatch
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: VIEW SHIPMENT DETAILS (Read Only) --- */}
      {isShipmentModalOpen && shipmentDetails && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1080 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-primary bg-gradient text-white border-0 p-4">
                <div className="d-flex align-items-center">
                  <div className="bg-white bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '45px', height: '45px' }}>
                    <i className="fa-solid fa-truck-fast fs-5"></i>
                  </div>
                  <h5 className="modal-title fw-bold m-0">Logistics Tracking</h5>
                </div>
                <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsShipmentModalOpen(false)}></button>
              </div>
              <div className="modal-body p-4 bg-light">
                <ul className="list-group list-group-flush rounded-3 shadow-sm border">
                  <li className="list-group-item d-flex justify-content-between align-items-center py-3 bg-white border-bottom">
                    <span className="text-muted fw-bold small text-uppercase"><i className="fa-solid fa-building me-2"></i> Transporter</span>
                    <span className="fw-bolder">{shipmentDetails.transporter_name || 'N/A'}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center py-3 bg-white border-bottom">
                    <span className="text-muted fw-bold small text-uppercase"><i className="fa-solid fa-car-side me-2"></i> Vehicle Number</span>
                    <span className="fw-bolder text-uppercase text-dark">{shipmentDetails.vehicle_number || 'N/A'}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center py-3 bg-white border-bottom">
                    <span className="text-muted fw-bold small text-uppercase"><i className="fa-solid fa-file-invoice me-2"></i> LR Number</span>
                    <span className="badge bg-primary bg-opacity-10 text-primary border border-primary px-3 py-2 fs-6 rounded-pill">{shipmentDetails.lr_number || 'N/A'}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center py-3 bg-white border-bottom">
                    <span className="text-muted fw-bold small text-uppercase"><i className="fa-solid fa-calendar-day me-2"></i> Est. Arrival</span>
                    <span className="fw-bolder text-success">{shipmentDetails.estimated_arrival_date || 'N/A'}</span>
                  </li>
                  {shipmentDetails.driver_phone && (
                    <li className="list-group-item d-flex justify-content-between align-items-center py-3 bg-white">
                      <span className="text-muted fw-bold small text-uppercase"><i className="fa-solid fa-phone me-2"></i> Driver Contact</span>
                      <span className="fw-bolder">{shipmentDetails.driver_phone}</span>
                    </li>
                  )}
                </ul>
              </div>
              <div className="modal-footer border-0 p-4 bg-white">
                <button type="button" className="btn btn-dark fw-bold px-5 rounded-pill shadow-sm w-100" onClick={() => setIsShipmentModalOpen(false)}>
                  Close Tracker
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: REGISTER CONSUMER --- */}
      {isConsumerModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleConsumerSubmit}>
                <div className="modal-header bg-dark bg-gradient text-white border-0 p-4">
                  <div className="d-flex align-items-center">
                    <div className="bg-white bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '45px', height: '45px' }}>
                      <i className="fa-solid fa-user-tag fs-5"></i>
                    </div>
                    <h5 className="modal-title fw-bold m-0">{editingConsumerId ? 'Update Identity' : 'Register Target Consumer'}</h5>
                  </div>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsConsumerModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <div className="row g-3">

                    {/* CASCADING GEO ALLOCATION FOR CONSUMER */}
                    <div className="col-12 p-3 bg-white rounded-4 shadow-sm border mb-2">
                       <label className="form-label small fw-bold text-uppercase text-dark mb-2"><i className="fa-solid fa-map-location-dot me-2"></i> Territory Allocation <span className="text-danger">*</span></label>
                       <div className="row g-2">
                          <div className="col-md-3">
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={consumerGeoFilter.zone_id} onChange={e => handleConsumerGeoChange('zone_id', e.target.value)}>
                              <option value="">Select Zone</option>
                              {geoMaster.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-3">
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={consumerGeoFilter.state_id} onChange={e => handleConsumerGeoChange('state_id', e.target.value)} disabled={!consumerGeoFilter.zone_id}>
                              <option value="">Select State</option>
                              {consumerGeoMaster.states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-3">
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={consumerGeoFilter.region_id} onChange={e => handleConsumerGeoChange('region_id', e.target.value)} disabled={!consumerGeoFilter.state_id}>
                              <option value="">Select Region</option>
                              {consumerGeoMaster.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-3">
                            <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={consumerGeoFilter.area_id} onChange={e => handleConsumerGeoChange('area_id', e.target.value)} disabled={!consumerGeoFilter.region_id}>
                              <option value="">Select Area</option>
                              {consumerGeoMaster.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div className="col-md-12 mt-2">
                            <select className="form-select border shadow-none py-2 fw-bold border-dark" required value={consumerForm.territory_id} onChange={e => setConsumerForm({...consumerForm, territory_id: e.target.value})} disabled={!consumerGeoFilter.area_id}>
                              <option value="">Select Assigned Territory...</option>
                              {consumerGeoMaster.territories.map(t => <option key={t.id} value={t.id}>{t.name} (ID: {t.id})</option>)}
                            </select>
                          </div>
                       </div>
                    </div>

                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Consumer / Barber Name <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-user"></i></span>
                         <input type="text" className="form-control border-0 shadow-none fw-semibold py-2" required value={consumerForm.name} onChange={e => setConsumerForm({...consumerForm, name: e.target.value})} />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Contact Number <span className="text-danger">*</span></label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-phone"></i></span>
                         <input type="text" className="form-control border-0 shadow-none fw-semibold py-2" required value={consumerForm.phone} onChange={e => setConsumerForm({...consumerForm, phone: e.target.value})} />
                      </div>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Physical Address</label>
                      <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                         <span className="input-group-text bg-white border-0 text-muted"><i className="fa-solid fa-location-dot"></i></span>
                         <input type="text" className="form-control border-0 shadow-none py-2" placeholder="Street, City, PIN..." value={consumerForm.address} onChange={e => setConsumerForm({...consumerForm, address: e.target.value})} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsConsumerModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-dark fw-bold px-5 rounded-pill shadow-sm bg-gradient">
                    <i className="fa-solid fa-address-card me-2"></i> Commit Registry
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