import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';

export default function OrderHub() {
  const { user } = useContext(AuthContext);


  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const userPerms = user?.role?.permissions?.map(p => p.name) || user?.permissions || [];

  const isAdmin = roleName?.toLowerCase() === 'admin' || userPerms.includes('manage_roles');

  const isPartner = ['SuperStockist', 'Distributor', 'Retailer'].includes(roleName);
  const isInternalTeam = isAdmin || ['ZSM', 'RSM', 'ASM', 'SO'].includes(roleName);

  const canViewPrimary = isAdmin || ['SuperStockist', 'Distributor', 'ZSM', 'RSM', 'ASM', 'SO'].includes(roleName);
  const canViewSecondary = isAdmin || ['Distributor', 'Retailer', 'ZSM', 'RSM', 'ASM', 'SO'].includes(roleName);
  const canViewTertiary = isAdmin || ['Retailer', 'ZSM', 'RSM', 'ASM', 'SO'].includes(roleName);
  const canViewConsumers = isAdmin || ['Retailer', 'ZSM', 'RSM', 'ASM', 'SO'].includes(roleName);

  const canPlacePrimary = isAdmin || userPerms.includes('create_primary_order');
  const canPlaceSecondary = isAdmin || userPerms.includes('create_secondary_order');
  const canPlaceTertiary = isAdmin || userPerms.includes('create_tertiary_order');
  const canManageConsumers = isAdmin || userPerms.includes('manage_partners');

  const canDispatchOrder = isAdmin || userPerms.includes('dispatch_order');
  const canReceiveOrder = isAdmin || userPerms.includes('receive_order');
  const canApproveOrder = isAdmin || userPerms.includes('approve_order');
  const canCancelOrder = isAdmin || userPerms.includes('cancel_order');

  const defaultTab = roleName === 'Retailer' ? 'tertiary' : roleName === 'Distributor' ? 'secondary' : 'primary';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const canPlaceOrderInCurrentTab =
    (activeTab === 'primary' && canPlacePrimary) ||
    (activeTab === 'secondary' && canPlaceSecondary) ||
    (activeTab === 'tertiary' && canPlaceTertiary);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const [masterData, setMasterData] = useState({ products: [], ss: [], distributors: [], retailers: [], consumers: [] });
  const [geoMaster, setGeoMaster] = useState({ zones: [], states: [], regions: [], areas: [], territories: [] });
  const [geoFilter, setGeoFilter] = useState({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });

  const [consumerGeoMaster, setConsumerGeoMaster] = useState({ states: [], regions: [], areas: [], territories: [] });
  const [consumerGeoFilter, setConsumerGeoFilter] = useState({ zone_id: '', state_id: '', region_id: '', area_id: '' });

  const [orders, setOrders] = useState([]);
  const [consumers, setConsumers] = useState([]);

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isConsumerModalOpen, setIsConsumerModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);

  const [approveConfirmId, setApproveConfirmId] = useState(null);
  const [shipmentDetails, setShipmentDetails] = useState(null);
  const [editingConsumerId, setEditingConsumerId] = useState(null);
  const [dispatchingOrderId, setDispatchingOrderId] = useState(null);

  const [orderForm, setOrderForm] = useState({ from_id: '', to_id: '', product_id: '', quantity: '', batch_number: '' });
  const [consumerForm, setConsumerForm] = useState({ name: '', phone: '', address: '', territory_id: '' });
  const [dispatchForm, setDispatchForm] = useState({ transporter_name: '', vehicle_number: '', lr_number: '', driver_phone: '', estimated_arrival_date: '' });

  const [primaryRouting, setPrimaryRouting] = useState('FACTORY_TO_SS');
  const [availableBatches, setAvailableBatches] = useState([]);

  const formatError = (err) => {
    let errorMsg = err.response?.data?.detail || err.message;
    if (Array.isArray(errorMsg)) return errorMsg.map(d => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(' | ');
    if (typeof errorMsg === 'object') return JSON.stringify(errorMsg);
    return errorMsg;
  };

  useEffect(() => {
    let isMounted = true;
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

        if (isMounted) {
            setMasterData({
              products: Array.isArray(prod.data) ? prod.data : prod.data?.items || [],
              ss: Array.isArray(ss.data) ? ss.data : ss.data?.items || [],
              distributors: Array.isArray(dist.data) ? dist.data : dist.data?.items || [],
              retailers: Array.isArray(ret.data) ? ret.data : ret.data?.items || [],
              consumers: Array.isArray(cons.data) ? cons.data : cons.data?.items || []
            });
            setGeoMaster(prev => ({ ...prev, zones: Array.isArray(zn.data) ? zn.data : zn.data?.items || [] }));
        }
      } catch (err) { if (isMounted) console.error("Hydration error", err); }
    };
    fetchMasterData();
    return () => { isMounted = false; };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'consumers') {
        const res = await api.get('/tertiary-sales/consumers');
        setConsumers(Array.isArray(res.data) ? res.data : res.data.items || []);
        setMasterData(prev => ({ ...prev, consumers: Array.isArray(res.data) ? res.data : res.data.items || [] }));
      } else {
        const endpoint = activeTab === 'primary' ? '/primary-orders/' : activeTab === 'secondary' ? '/secondary-sales/' : '/tertiary-sales/';
        const res = await api.get(endpoint);
        setOrders(Array.isArray(res.data) ? res.data : res.data.items || res.data.orders || []);
      }
    } catch (err) {
      toast.error(`Failed to load ${activeTab} data.`);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTab]);

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

  const getTargetTier = () => {
    if (activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS') return 'ss';
    if (activeTab === 'primary' && (primaryRouting === 'FACTORY_TO_DB' || primaryRouting === 'SS_TO_DB')) return 'distributor';
    if (activeTab === 'secondary') return 'retailer';
    if (activeTab === 'tertiary') return 'consumer';
    return null;
  };

  const handleGeoChange = async (field, value) => {
    setOrderForm(prev => ({ ...prev, to_id: '' }));
    if (field === 'zone_id') {
      setGeoFilter({ zone_id: value, state_id: '', region_id: '', area_id: '', territory_id: '' });
      setGeoMaster(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/zones/${value}/states`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, states: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
      }
    }
    else if (field === 'state_id') {
      setGeoFilter(prev => ({ ...prev, state_id: value, region_id: '', area_id: '', territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/states/${value}/regions`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, regions: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
      }
    }
    else if (field === 'region_id') {
      setGeoFilter(prev => ({ ...prev, region_id: value, area_id: '', territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/regions/${value}/areas`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, areas: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
      }
    }
    else if (field === 'area_id') {
      setGeoFilter(prev => ({ ...prev, area_id: value, territory_id: '' }));
      setGeoMaster(prev => ({ ...prev, territories: [] }));
      if (value) {
        const res = await api.get(`/geo/areas/${value}/territories`).catch(() => ({ data: [] }));
        setGeoMaster(prev => ({ ...prev, territories: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
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
        setConsumerGeoMaster(prev => ({ ...prev, states: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
      }
    }
    else if (field === 'state_id') {
      setConsumerGeoFilter(prev => ({ ...prev, state_id: value, region_id: '', area_id: '' }));
      setConsumerForm(prev => ({ ...prev, territory_id: '' }));
      setConsumerGeoMaster(prev => ({ ...prev, regions: [], areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/states/${value}/regions`).catch(() => ({ data: [] }));
        setConsumerGeoMaster(prev => ({ ...prev, regions: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
      }
    }
    else if (field === 'region_id') {
      setConsumerGeoFilter(prev => ({ ...prev, region_id: value, area_id: '' }));
      setConsumerForm(prev => ({ ...prev, territory_id: '' }));
      setConsumerGeoMaster(prev => ({ ...prev, areas: [], territories: [] }));
      if (value) {
        const res = await api.get(`/geo/regions/${value}/areas`).catch(() => ({ data: [] }));
        setConsumerGeoMaster(prev => ({ ...prev, areas: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
      }
    }
    else if (field === 'area_id') {
      setConsumerGeoFilter(prev => ({ ...prev, area_id: value }));
      setConsumerForm(prev => ({ ...prev, territory_id: '' }));
      setConsumerGeoMaster(prev => ({ ...prev, territories: [] }));
      if (value) {
        const res = await api.get(`/geo/areas/${value}/territories`).catch(() => ({ data: [] }));
        setConsumerGeoMaster(prev => ({ ...prev, territories: Array.isArray(res.data) ? res.data : (res.data.items || []) }));
      }
    }
  };

  const getFilteredDestinations = () => {
    const targetTier = getTargetTier();

    // If internal team hasn't selected a sender yet, return empty
    if (isInternalTeam && !orderForm.from_id && !(activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))) return [];

    let list = [];
    if (targetTier === 'ss') list = masterData.ss;
    else if (targetTier === 'distributor') list = masterData.distributors;
    else if (targetTier === 'retailer') list = masterData.retailers;
    else if (targetTier === 'consumer') list = masterData.consumers;

    // Apply internal team geo-filters if they are interacting
    if (isInternalTeam) {
        if (geoFilter.territory_id) return list.filter(x => x.territory_id == geoFilter.territory_id);
        if (geoFilter.area_id) return list.filter(x => x.area_id == geoFilter.area_id);
        if (geoFilter.region_id) return list.filter(x => x.region_id == geoFilter.region_id);
        if (geoFilter.state_id) return list.filter(x => x.state_id == geoFilter.state_id);
        if (geoFilter.zone_id) return list.filter(x => x.zone_id == geoFilter.zone_id);
    }

    return list;
  };

  const filteredDestinations = getFilteredDestinations();

  const getProductName = (id) => {
    const p = masterData.products.find(x => x.id === parseInt(id));
    return p ? p.name || p.product_name : `PRD-${id}`;
  };

  const getPartnerName = (tier, id) => {
    if (!id) return '-';
    let list = tier === 'ss' ? masterData.ss : tier === 'distributor' ? masterData.distributors : tier === 'retailer' ? masterData.retailers : masterData.consumers;
    const p = list.find(x => x.id === parseInt(id));
    return p ? (p.name || p.firm_name || p.shop_name) : `ID: ${id}`;
  };

  // --- FORM HANDLERS ---
  const handleConsumerSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const toastId = toast.loading(editingConsumerId ? 'Updating consumer...' : 'Registering consumer...');
    try {
      const payload = { name: consumerForm.name, mobile_number: consumerForm.phone, address: consumerForm.address, territory_id: parseInt(consumerForm.territory_id), type: "Consumer" };
      if (editingConsumerId) {
        await api.patch(`/tertiary-sales/consumers/${editingConsumerId}`, payload);
        toast.success('Consumer profile updated', { id: toastId });
      } else {
        await api.post('/tertiary-sales/consumers', payload);
        toast.success('Consumer registered successfully', { id: toastId });
      }
      setIsConsumerModalOpen(false);
      fetchData();
    } catch (err) { toast.error(`Error: ${formatError(err)}`, { id: toastId }); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteConsumer = async (id, name) => {
    if (!window.confirm(`Permanently remove consumer ${name}?`)) return;
    const toastId = toast.loading(`Removing ${name}...`);
    try {
      await api.delete(`/tertiary-sales/consumers/${id}`);
      toast.success('Consumer removed', { id: toastId });
      fetchData();
    } catch (err) { toast.error(`Failed to remove consumer: ${formatError(err)}`, { id: toastId }); }
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
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
      fetchData();
    } catch (err) { toast.error(`Validation Error: ${formatError(err)}`, { id: toastId }); }
    finally { setIsSubmitting(false); }
  };

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const toastId = toast.loading('Dispatching order to logistics...');

    try {
      const baseRoute = activeTab === 'primary' ? 'primary-orders' : activeTab === 'secondary' ? 'secondary-sales' : 'tertiary-sales';
      const payload = { ...dispatchForm, transport_name: dispatchForm.transporter_name };
      if (!payload.driver_phone) delete payload.driver_phone;

      await api.post(`/${baseRoute}/${dispatchingOrderId}/dispatch`, payload);
      toast.success('Order dispatched successfully!', { id: toastId });
      setIsDispatchModalOpen(false);
      fetchData();
    } catch (err) { toast.error(`Dispatch failed: ${formatError(err)}`, { id: toastId }); }
    finally { setIsSubmitting(false); }
  };

  const handleOrderStatus = async (action, orderId, isConfirmed = false) => {
    setOpenDropdownId(null);
    if (action === 'approve' && (activeTab === 'secondary' || activeTab === 'tertiary') && !isConfirmed) {
      setApproveConfirmId(orderId);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);

    const toastId = toast.loading(`Processing workflow: ${action}...`);
    try {
      const baseRoute = activeTab === 'primary' ? 'primary-orders' : activeTab === 'secondary' ? 'secondary-sales' : 'tertiary-sales';
      if (action === 'cancel') await api.put(`/${baseRoute}/${orderId}/cancel`);
      else if (action === 'receive') await api.post(`/${baseRoute}/${orderId}/receive`);
      else if (action === 'approve') await api.patch(`/${baseRoute}/${orderId}/approve`);

      toast.success(`Order ${action} executed!`, { id: toastId });
      fetchData();
    } catch (err) { toast.error(`Action failed: ${formatError(err)}`, { id: toastId }); }
    finally { setIsSubmitting(false); }
  };

  // --- SMART PRE-FILL INJECTOR ---
  const initializeOrderModal = () => {
    let prefillFrom = '';
    let prefillTo = '';

    if (isPartner) {
        if (roleName === 'SuperStockist' && masterData.ss.length > 0) {
            if (activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS') {
                prefillFrom = '1';
                prefillTo = masterData.ss[0].id.toString();
            } else if (activeTab === 'primary' && primaryRouting === 'SS_TO_DB') {
                prefillFrom = masterData.ss[0].id.toString();
            }
        } else if (roleName === 'Distributor' && masterData.distributors.length > 0) {
            prefillFrom = masterData.distributors[0].id.toString();
        } else if (roleName === 'Retailer' && masterData.retailers.length > 0) {
            prefillFrom = masterData.retailers[0].id.toString();
        }
    }

    setOrderForm({ from_id: prefillFrom, to_id: prefillTo, product_id: '', quantity: '', batch_number: '' });
    setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });
    setIsOrderModalOpen(true);
  };

  const initializeConsumerModal = () => {
    setEditingConsumerId(null);
    let defaultTerritory = '';
    if (roleName === 'Retailer' && masterData.retailers.length > 0) {
        defaultTerritory = masterData.retailers[0].territory_id?.toString() || '';
    }
    setConsumerForm({ name: '', phone: '', address: '', territory_id: defaultTerritory });
    setConsumerGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '' });
    setIsConsumerModalOpen(true);
  }

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
          {activeTab === 'consumers' && canManageConsumers ? (
            <button className="btn btn-dark shadow-sm rounded-pill px-4 fw-semibold" onClick={initializeConsumerModal}>
              <i className="fa-solid fa-user-plus me-2"></i> Register Barber / Consumer
            </button>
          ) : activeTab !== 'consumers' && canPlaceOrderInCurrentTab ? (
            <button className="btn btn-primary shadow-sm rounded-pill px-4 fw-semibold" onClick={initializeOrderModal}>
              <i className="fa-solid fa-cart-plus me-2"></i> Place {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Order
            </button>
          ) : null}
        </div>
      </div>

      {/* TIER NAVIGATION */}
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
            {canViewConsumers && (
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

                  let destId = null;
                  let targetTier = 'consumer';

                  if (activeTab === 'primary') {
                    destId = o.to_entity_id || o.ss_id;
                    targetTier = (o.type === 'FACTORY_TO_DB' || o.type === 'SS_TO_DB') ? 'distributor' : 'ss';
                  } else if (activeTab === 'secondary') {
                    destId = o.retailer_id;
                    targetTier = 'retailer';
                  } else if (activeTab === 'tertiary') {
                    destId = o.end_consumer_id;
                    targetTier = 'consumer';
                  }

                  const destName = destId ? getPartnerName(targetTier, destId) : 'Destination Pending...';

                  let originName = '🏭 Main Factory';
                  if (activeTab === 'primary' && o.type === 'SS_TO_DB') {
                      originName = getPartnerName('ss', o.from_entity_id);
                  } else if (activeTab === 'secondary') {
                      originName = getPartnerName('distributor', o.distributor_id);
                  } else if (activeTab === 'tertiary') {
                      originName = getPartnerName('retailer', o.fulfilled_by_retailer_id);
                  }

                  const itemInfo = o.items && o.items.length > 0 ? o.items[0] : null;
                  const prodId = itemInfo ? itemInfo.product_id : o.product_id;
                  const qty = itemInfo ? (itemInfo.quantity_cases || itemInfo.quantity_units || itemInfo.quantity) : (o.quantity_cases || o.quantity_units || o.quantity);
                  const batch = itemInfo ? itemInfo.batch_number : o.batch_number;

                  const displayStatus = o.status || 'LOGGED';
                  const isDispatched = (displayStatus === 'DISPATCHED' || displayStatus === 'Dispatched');
                  const isPending = (displayStatus === 'Pending' || displayStatus === 'PENDING');
                  const isApproved = (displayStatus === 'APPROVED' || displayStatus === 'Approved' || displayStatus === 'Approved_by_SO');

                  const showApprove = canApproveOrder && isPending && (activeTab === 'secondary' || activeTab === 'tertiary');
                  const showDispatch = canDispatchOrder && ((activeTab === 'primary' && isPending) || (activeTab === 'secondary' && isApproved));
                  const showReceive = canReceiveOrder && isDispatched && (activeTab === 'primary' || activeTab === 'secondary');
                  const showCancel = canCancelOrder && !isDispatched && (isPending || isApproved);

                  const needsAction = showApprove || showDispatch || showReceive || showCancel || isDispatched;

                  return (
                  <tr key={o.id}>
                    <td className="px-4">
                      <code className="bg-dark bg-opacity-10 text-dark px-2 py-1 rounded fw-bold border">
                        {o.order_number || o.invoice_number || `ORD-${o.id}`}
                      </code>
                    </td>
                    <td>
                      <div className="d-flex align-items-center bg-light rounded-pill px-2 py-1 d-inline-flex border">
                        <span className="badge bg-white text-dark border shadow-sm rounded-pill px-3">{originName}</span>
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
                        <div className="text-muted small fst-italic"><i className="fa-solid fa-hourglass-half me-1"></i> Awaiting Payload Data...</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge rounded-pill px-3 py-2 text-uppercase shadow-sm border ${
                        isPending ? 'bg-warning bg-opacity-10 text-warning border-warning border-opacity-50' :
                        isApproved ? 'bg-primary bg-opacity-10 text-primary border-primary border-opacity-50' :
                        isDispatched ? 'bg-info bg-opacity-10 text-info border-info border-opacity-50' :
                        displayStatus === 'RECEIVED' || displayStatus === 'Received' || displayStatus === 'FULFILLED' ? 'bg-success bg-opacity-10 text-success border-success border-opacity-50' :
                        displayStatus === 'CANCELLED' || displayStatus === 'Cancelled' ? 'bg-danger bg-opacity-10 text-danger border-danger border-opacity-50' : 'bg-secondary bg-opacity-10 text-secondary border-secondary border-opacity-50'
                      }`}>
                        <i className={`fa-solid ${
                          isPending ? 'fa-clock' : 
                          isApproved ? 'fa-thumbs-up' :
                          isDispatched ? 'fa-truck-fast' : 
                          displayStatus === 'RECEIVED' || displayStatus === 'Received' || displayStatus === 'FULFILLED' ? 'fa-check-double' : 
                          'fa-ban'} me-1`}></i>
                        {displayStatus.replace('_by_SO', ' (SO)')}
                      </span>
                    </td>
                    <td className="text-end px-4">
                      {needsAction ? (
                        <div className="dropdown position-relative">
                          <button className="btn btn-sm btn-dark rounded-pill shadow-sm px-3 fw-bold dropdown-toggle" type="button" onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === o.id ? null : o.id); }}>
                            <i className="fa-solid fa-bolt me-1 text-warning"></i> Action
                          </button>
                          <ul className={`dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-4 mt-1 p-2 ${openDropdownId === o.id ? 'show' : ''}`} style={{ position: 'absolute', right: 0, top: '100%', zIndex: 1050 }}>
                            {showApprove &&
                              <li>
                                <button className="dropdown-item rounded-3 text-primary fw-bold py-2 mb-1" onClick={() => handleOrderStatus('approve', o.id)}>
                                  <div className="bg-primary bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className={`fa-solid ${activeTab === 'tertiary' ? 'fa-shield-check' : 'fa-thumbs-up'} text-primary`}></i></div>
                                  {activeTab === 'tertiary' ? 'Authenticate & Approve' : 'Approve Order'}
                                </button>
                              </li>
                            }
                            {showDispatch &&
                              <li>
                                <button className="dropdown-item rounded-3 text-info fw-bold py-2 mb-1" onClick={() => { setOpenDropdownId(null); setDispatchingOrderId(o.id); setDispatchForm({ transporter_name: '', vehicle_number: '', lr_number: `LR-${Date.now().toString().slice(-6)}`, driver_phone: '', estimated_arrival_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0] }); setIsDispatchModalOpen(true); }}>
                                  <div className="bg-info bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className="fa-solid fa-truck-fast text-info"></i></div> Dispatch Logistics
                                </button>
                              </li>
                            }
                            {isDispatched && o.shipment && (
                              <li>
                                <button className="dropdown-item rounded-3 text-primary fw-bold py-2 mb-1" onClick={() => { setOpenDropdownId(null); setShipmentDetails(o.shipment); setIsShipmentModalOpen(true); }}>
                                  <div className="bg-primary bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className="fa-solid fa-eye text-primary"></i></div> View Logistics
                                </button>
                              </li>
                            )}
                            {showReceive &&
                              <li>
                                <button className="dropdown-item rounded-3 text-success fw-bold py-2 mb-1" onClick={() => handleOrderStatus('receive', o.id)}>
                                  <div className="bg-success bg-opacity-10 d-inline-block p-2 rounded-circle me-2"><i className="fa-solid fa-box-open text-success"></i></div> Mark Received
                                </button>
                              </li>
                            }
                            {showCancel && (
                              <>
                                <li><hr className="dropdown-divider opacity-10 m-1" /></li>
                                <li><button className="dropdown-item rounded-3 text-danger fw-bold py-2" onClick={() => handleOrderStatus('cancel', o.id)}><i className="fa-solid fa-ban text-danger me-3 ms-1"></i> Abort / Cancel</button></li>
                              </>
                            )}
                          </ul>
                        </div>
                      ) : (
                        <span className="text-muted small fw-semibold fst-italic"><i className="fa-solid fa-lock me-1"></i> Processed</span>
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

      {/* --- MODAL: CONFIRM APPROVAL --- */}
      {approveConfirmId && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 1090 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <div className="modal-header bg-danger bg-gradient text-white border-0 p-4">
                <div className="d-flex align-items-center">
                  <div className="bg-white bg-opacity-25 rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '45px', height: '45px' }}>
                    <i className="fa-solid fa-shield-halved fs-5"></i>
                  </div>
                  <h5 className="modal-title fw-bold m-0">Security & Authentication</h5>
                </div>
                <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setApproveConfirmId(null)}></button>
              </div>
              <div className="modal-body p-4 bg-light">
                <h5 className="fw-bolder text-dark mb-3">Authorize this approval?</h5>
                <p className="text-muted fw-semibold mb-0" style={{ lineHeight: '1.6' }}>
                  By confirming, you verify that you have checked <span className="text-danger">physical stock</span> and the appropriate <span className="text-danger">partner territory metrics</span> to fulfill this request.
                </p>
              </div>
              <div className="modal-footer border-0 p-4 bg-white">
                <button type="button" disabled={isSubmitting} className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setApproveConfirmId(null)}>Cancel</button>
                <button type="button" disabled={isSubmitting} className="btn btn-danger fw-bold px-5 rounded-pill shadow-sm" onClick={() => handleOrderStatus('approve', approveConfirmId, true)}>
                  {isSubmitting ? 'Authenticating...' : <><i className="fa-solid fa-check-double me-2"></i> Confirm Authentication</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

                    {activeTab === 'primary' && (
                      <div className="col-12 mb-2">
                        <label className="form-label small fw-bold text-uppercase text-muted mb-2">Primary Route Vector <span className="text-danger">*</span></label>
                        <div className="btn-group w-100 shadow-sm" role="group">
                          <button type="button" className={`btn ${primaryRouting === 'FACTORY_TO_SS' ? 'btn-primary fw-bold' : 'btn-white bg-white text-muted border'}`} onClick={() => {
                            setPrimaryRouting('FACTORY_TO_SS');
                            setOrderForm({...orderForm, from_id: '1', to_id: isPartner && masterData.ss.length > 0 ? masterData.ss[0].id.toString() : ''});
                            setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });
                          }}>
                             {isInternalTeam ? '🏭 Factory ➝ 🏢 Super Stockist' : '📥 Request Stock from Factory'}
                          </button>

                          {isInternalTeam && (
                             <button type="button" className={`btn ${primaryRouting === 'FACTORY_TO_DB' ? 'btn-primary fw-bold' : 'btn-white bg-white text-muted border'}`} onClick={() => {
                               setPrimaryRouting('FACTORY_TO_DB');
                               setOrderForm({...orderForm, from_id: '1', to_id: ''});
                               setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });
                             }}>🏭 Factory ➝ 🚚 Distributor</button>
                          )}

                          <button type="button" className={`btn ${primaryRouting === 'SS_TO_DB' ? 'btn-primary fw-bold' : 'btn-white bg-white text-muted border'}`} onClick={() => {
                            setPrimaryRouting('SS_TO_DB');
                            setOrderForm({...orderForm, from_id: isPartner && masterData.ss.length > 0 ? masterData.ss[0].id.toString() : '', to_id: ''});
                            setGeoFilter({ zone_id: '', state_id: '', region_id: '', area_id: '', territory_id: '' });
                          }}>
                              {isInternalTeam ? '🏢 Super Stockist ➝ 🚚 Distributor' : '📤 Dispatch to Distributor'}
                          </button>
                        </div>
                      </div>
                    )}

                    {isInternalTeam ? (
                      /* ============================================== */
                      /* INTERNAL TEAM UI: FULL SELECTION CAPABILITIES  */
                      /* ============================================== */
                      <>
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
                              <select className="form-select border-0 shadow-none py-2 fw-semibold" required value={orderForm.from_id} onChange={e => setOrderForm({...orderForm, from_id: e.target.value, to_id: '', batch_number: ''})}>
                                <option value="" disabled>Select Origin Sender...</option>
                                {activeTab === 'primary' && primaryRouting === 'SS_TO_DB' && masterData.ss.map(p => <option key={p.id} value={p.id}>{p.name || p.firm_name} (ID: {p.id})</option>)}
                                {activeTab === 'secondary' && masterData.distributors.map(p => <option key={p.id} value={p.id}>{p.name || p.firm_name} (ID: {p.id})</option>)}
                                {activeTab === 'tertiary' && masterData.retailers.map(p => <option key={p.id} value={p.id}>{p.name || p.shop_name} (ID: {p.id})</option>)}
                              </select>
                            </div>
                          )}
                        </div>

                        {(orderForm.from_id || (activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))) && (
                          <div className="col-12 p-3 bg-white rounded-4 shadow-sm border">
                            <label className="form-label small fw-bold text-uppercase text-primary mb-2"><i className="fa-solid fa-earth-asia me-2"></i> Find Target by Geography</label>
                            <div className="row g-2">
                              <div className="col-md-3">
                                <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={geoFilter.zone_id} onChange={e => handleGeoChange('zone_id', e.target.value)}>
                                  <option value="">Select Zone</option>
                                  {geoMaster.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                                </select>
                              </div>
                              {(getTargetTier() === 'distributor' || getTargetTier() === 'retailer' || getTargetTier() === 'consumer') && (
                                <div className="col-md-3">
                                  <select className="form-select form-select-sm border bg-light shadow-none fw-semibold" value={geoFilter.state_id} onChange={e => handleGeoChange('state_id', e.target.value)} disabled={!geoFilter.zone_id}>
                                    <option value="">Select State</option>
                                    {geoMaster.states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                  </select>
                                </div>
                              )}
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

                        <div className="col-12 mt-2">
                          <label className="form-label small fw-bold text-uppercase text-muted mb-1">Delivery Destination <span className="text-danger">*</span></label>
                          <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                             <span className="input-group-text bg-white border-0"><i className={`fa-solid ${activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS' ? 'fa-building text-primary' : activeTab === 'primary' || activeTab === 'secondary' ? 'fa-truck-fast text-success' : 'fa-user text-warning'}`}></i></span>
                            <select className="form-select border-0 shadow-none py-2 fw-bold" required value={orderForm.to_id} onChange={e => setOrderForm({...orderForm, to_id: e.target.value})} disabled={!orderForm.from_id && !(activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))}>
                              <option value="" disabled>Select Target Destination...</option>
                              {filteredDestinations.map(p => <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>)}
                            </select>
                          </div>
                          {filteredDestinations.length === 0 && (orderForm.from_id || (activeTab === 'primary' && primaryRouting.startsWith('FACTORY'))) && (
                            <div className="form-text text-danger mt-1 small" style={{fontSize: '0.75rem'}}><i className="fa-solid fa-triangle-exclamation me-1"></i> No partners found based on current filters.</div>
                          )}
                        </div>
                      </>
                    ) : (
                      /* ============================================== */
                      /* PARTNER UI: ZERO FRICTION & AUTO-ROUTED        */
                      /* ============================================== */
                      <>
                        <div className="col-12">
                           <div className="d-flex align-items-center justify-content-between bg-white p-3 rounded-4 border shadow-sm">
                              <span className="text-muted fw-bold small text-uppercase"><i className="fa-solid fa-route me-2"></i> Routing Vector</span>
                              <div className="d-flex align-items-center fw-bold">
                                 <span className="badge bg-light text-dark border px-3 py-2 rounded-pill fs-6 shadow-sm">
                                   {activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS' ? '🏭 Main Factory' : '🏢 My Warehouse'}
                                 </span>
                                 <i className="fa-solid fa-arrow-right mx-3 text-muted"></i>
                                 <span className="badge bg-primary bg-opacity-10 text-primary border border-primary px-3 py-2 rounded-pill fs-6 shadow-sm">
                                   {activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS' ? '🏢 My Warehouse' : '🎯 Target Partner'}
                                 </span>
                              </div>
                           </div>
                        </div>

                        {/* Only ask for Destination if they are sending OUT */}
                        {!(activeTab === 'primary' && primaryRouting === 'FACTORY_TO_SS') && (
                          <div className="col-12 mt-2">
                            <label className="form-label small fw-bold text-uppercase text-muted mb-1">
                              Select Target {activeTab === 'primary' ? 'Distributor' : activeTab === 'secondary' ? 'Retailer' : 'Consumer'} <span className="text-danger">*</span>
                            </label>
                            <div className="input-group bg-white rounded-3 shadow-sm border overflow-hidden">
                              <span className="input-group-text bg-white border-0"><i className="fa-solid fa-crosshairs text-primary"></i></span>
                              <select className="form-select border-0 shadow-none py-2 fw-bold" required value={orderForm.to_id} onChange={e => setOrderForm({...orderForm, to_id: e.target.value})}>
                                <option value="" disabled>Select Target Destination...</option>
                                {filteredDestinations.map(p => (
                                  <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name}</option>
                                ))}
                              </select>
                            </div>
                            {filteredDestinations.length === 0 && (
                              <div className="form-text text-danger mt-1 small" style={{fontSize: '0.75rem'}}>
                                <i className="fa-solid fa-triangle-exclamation me-1"></i> No connected partners found to dispatch to.
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* COMMON PAYLOAD DETAILS (Product, Batch, Units) */}
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
                  <button type="submit" disabled={isSubmitting} className={`btn fw-bold px-5 rounded-pill shadow-sm bg-gradient ${activeTab === 'primary' ? 'btn-primary' : activeTab === 'secondary' ? 'btn-success' : 'btn-warning text-dark'}`}>
                    <i className="fa-solid fa-satellite-dish me-2"></i> {isSubmitting ? 'Transmitting...' : 'Transmit Order'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: DISPATCH LOGISTICS DETAILS --- */}
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
                  <button type="submit" disabled={isSubmitting} className="btn btn-info fw-bold text-white px-5 rounded-pill shadow-sm bg-gradient">
                    <i className="fa-solid fa-truck-ramp-box me-2"></i> {isSubmitting ? 'Dispatching...' : 'Confirm Dispatch'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: VIEW SHIPMENT DETAILS --- */}
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

                    {isInternalTeam && (
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
                    )}

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
                  <button type="submit" disabled={isSubmitting} className="btn btn-dark fw-bold px-5 rounded-pill shadow-sm bg-gradient">
                    <i className="fa-solid fa-address-card me-2"></i> {isSubmitting ? 'Committing...' : 'Commit Registry'}
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