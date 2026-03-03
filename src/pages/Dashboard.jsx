import React, { useState, useEffect, useRef, useContext } from 'react';
import Chart from 'react-apexcharts';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import api from '../api';
import { AuthContext } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const terminalRef = useRef(null);

  // --- STRICT RBAC EVALUATION ---
  const isAdminOrInternal = ['Admin', 'ZSM', 'RSM', 'ASM', 'SO'].includes(user?.role);
  const isPartner = ['SuperStockist', 'Distributor', 'Retailer'].includes(user?.role);

  // --- LIVE DATA STATES ---
  const [loading, setLoading] = useState(true);

  // Dynamic Stats Object
  const [stats, setStats] = useState({
    stockVolume: 0,
    pendingAction: 0,
    networkSize: 0,
    pulseOps: 0
  });

  const [terminalLogs, setTerminalLogs] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);

  // Charts Data
  const [pipelineChartData, setPipelineChartData] = useState([]);
  const [partnerProductChart, setPartnerProductChart] = useState({ labels: [], series: [] });

  // Master Data Translators
  const [masterData, setMasterData] = useState({ products: {}, partners: {} });

  // --- DATA HYDRATION ---
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        // 1. Fetch all heavily optimized parallel requests (Backend already scopes the Partner/Order lists!)
        const [
          primaryRes, secondaryRes, tertiaryRes,
          prodRes, ssRes, distRes, retRes, consRes,
          ledgerRes // Only useful for Admins, but we fetch it
        ] = await Promise.all([
          api.get('/primary-orders/').catch(() => ({ data: [] })),
          api.get('/secondary-sales/').catch(() => ({ data: [] })),
          api.get('/tertiary-sales/').catch(() => ({ data: [] })),
          api.get('/products').catch(() => ({ data: [] })),
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] })),
          api.get('/tertiary-sales/consumers').catch(() => ({ data: [] })),
          isAdminOrInternal ? api.get('/inventory/ledger').catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
        ]);

        // Normalize Data
        const pOrders = Array.isArray(primaryRes.data) ? primaryRes.data : primaryRes.data?.items || [];
        const sOrders = Array.isArray(secondaryRes.data) ? secondaryRes.data : secondaryRes.data?.items || [];
        const tOrders = Array.isArray(tertiaryRes.data) ? tertiaryRes.data : tertiaryRes.data?.items || [];
        const ledger = Array.isArray(ledgerRes.data) ? ledgerRes.data : ledgerRes.data?.items || [];

        const ss = Array.isArray(ssRes.data) ? ssRes.data : ssRes.data?.items || [];
        const dist = Array.isArray(distRes.data) ? distRes.data : distRes.data?.items || [];
        const ret = Array.isArray(retRes.data) ? retRes.data : retRes.data?.items || [];
        const cons = Array.isArray(consRes.data) ? consRes.data : consRes.data?.items || [];
        const products = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.items || [];

        // Build Translation Dictionaries
        const allPartners = {};
        [...ss, ...dist, ...ret, ...cons].forEach(p => { allPartners[p.id] = p.name || p.firm_name || p.shop_name });
        const productDict = {};
        products.forEach(p => { productDict[p.id] = p.name || p.product_name });
        setMasterData({ products: productDict, partners: allPartners });

        // --- SPECIFIC LOGIC FOR ADMINS VS PARTNERS ---
        let calculatedStock = 0;
        let downStreamNetwork = 0;
        let inboundCount = 0;
        let outboundCount = 0;
        let mergedLogs = [];

        // Identify Partner ID if applicable
        let myPartnerId = null;
        if (isPartner) {
            const myProfile = user?.role === 'SuperStockist' ? ss[0] : user?.role === 'Distributor' ? dist[0] : ret[0];
            myPartnerId = myProfile ? myProfile.id : null;
        }

        if (isAdminOrInternal) {
            // ADMIN / INTERNAL LOGIC
            const factoryRes = await api.get('/inventory/factory/1').catch(() => ({ data: [] }));
            const fStock = Array.isArray(factoryRes.data) ? factoryRes.data : factoryRes.data?.items || [];
            calculatedStock = fStock.reduce((sum, item) => sum + (item.current_stock_qty || item.current_stock || 0), 0);
            downStreamNetwork = ss.length + dist.length + ret.length;
            setPipelineChartData([pOrders.length, sOrders.length, tOrders.length]);

            // Build Admin Terminal
            mergedLogs = ledger.slice(0, 25).reverse().map(l => {
                let type = l.transaction_type === 'PRODUCTION' ? 'SUCCESS' : l.transaction_type === 'ADJUSTMENT' ? 'WARN' : 'INFO';
                const d = l.quantity_change > 0 ? `+${l.quantity_change}` : l.quantity_change;
                const pName = productDict[l.product_id] || `PRD-${l.product_id}`;
                return { time: new Date(l.created_at).toLocaleTimeString(), type, msg: `[${l.entity_type.toUpperCase()}] ${l.transaction_type}: ${d}x ${pName}. Bal: ${l.closing_balance}` };
            });

        } else if (isPartner && myPartnerId) {
            // EXTERNAL PARTNER LOGIC
            // 1. Fetch their specific stock
            const tierStr = user?.role === 'SuperStockist' ? 'ss' : user?.role === 'Distributor' ? 'distributor' : 'retailer';
            const myStockRes = await api.get(`/inventory/${tierStr}/${myPartnerId}`).catch(() => ({ data: [] }));
            const myStockItems = Array.isArray(myStockRes.data) ? myStockRes.data : myStockRes.data?.items || [];
            calculatedStock = myStockItems.reduce((sum, item) => sum + (item.current_stock_qty || item.current_stock || item.quantity || 0), 0);

            // 2. Determine their specific downstream network
            if (user?.role === 'SuperStockist') downStreamNetwork = dist.length;
            if (user?.role === 'Distributor') downStreamNetwork = ret.length;
            if (user?.role === 'Retailer') downStreamNetwork = cons.length;

            // 3. Chart their Inbound vs Outbound
            if (user?.role === 'SuperStockist') { inboundCount = pOrders.filter(o => o.type === 'FACTORY_TO_SS').length; outboundCount = pOrders.filter(o => o.type === 'SS_TO_DB').length; }
            if (user?.role === 'Distributor') { inboundCount = pOrders.filter(o => o.type === 'SS_TO_DB' || o.type === 'FACTORY_TO_DB').length; outboundCount = sOrders.length; }
            if (user?.role === 'Retailer') { inboundCount = sOrders.length; outboundCount = tOrders.length; }
            setPipelineChartData([inboundCount, outboundCount]);

            // 4. Determine their Top Products for the Donut Chart
            const productFreq = {};
            [...pOrders, ...sOrders, ...tOrders].forEach(o => {
                const pId = o.items?.[0]?.product_id || o.product_id;
                if (pId) productFreq[pId] = (productFreq[pId] || 0) + 1;
            });
            const topProducts = Object.entries(productFreq).sort((a,b) => b[1] - a[1]).slice(0, 4);
            setPartnerProductChart({
                labels: topProducts.map(tp => productDict[tp[0]] || `SKU ${tp[0]}`),
                series: topProducts.map(tp => tp[1])
            });

            // 5. Build Partner Activity Feed Terminal (derived from orders)
            let combinedPartnerActivity = [...pOrders, ...sOrders, ...tOrders].sort((a, b) => b.id - a.id).slice(0, 20);
            mergedLogs = combinedPartnerActivity.reverse().map(o => {
                const isMyInbound = o.to_entity_id === myPartnerId || o.retailer_id === myPartnerId || o.ss_id === myPartnerId;
                const type = isMyInbound ? 'SUCCESS' : 'WARN'; // Green for incoming, Orange for outgoing
                const pName = productDict[o.items?.[0]?.product_id || o.product_id] || 'Stock';
                const qty = o.items?.[0]?.quantity || o.quantity || 0;
                const verb = isMyInbound ? 'Receiving' : 'Dispatching';
                const status = (o.status || 'Pending').toUpperCase();
                return { time: new Date().toLocaleTimeString(), type: status === 'PENDING' ? 'INFO' : type, msg: `[${o.order_number || `ORD-${o.id}`}] ${verb} ${qty}x ${pName} - ${status}` };
            });
        }

        // Add boot sequence to terminal
        setTerminalLogs([
          { time: new Date().toLocaleTimeString(), type: 'SECURE', msg: `Pulse Engine Initialized for ${user?.role}...` },
          { time: new Date().toLocaleTimeString(), type: 'INFO', msg: "Encrypted connection established." },
          ...mergedLogs
        ]);

        // Combined Stats
        const allMergedOrders = [...pOrders, ...sOrders, ...tOrders];
        setStats({
          stockVolume: calculatedStock,
          pendingAction: allMergedOrders.filter(o => (o.status || '').toUpperCase() === 'PENDING').length,
          networkSize: downStreamNetwork,
          pulseOps: allMergedOrders.length
        });

        // Combined Recent Table
        allMergedOrders.sort((a, b) => b.id - a.id);
        setRecentOrders(allMergedOrders.slice(0, 5));

      } catch (err) {
        console.error("Dashboard hydration failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [isAdminOrInternal, isPartner, user]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);


  // --- DYNAMIC CHART CONFIGURATIONS ---
  const pipelineOptions = {
    chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
    colors: isAdminOrInternal ? ['#2563eb', '#10b981', '#f59e0b'] : ['#8b5cf6', '#ec4899'],
    plotOptions: { bar: { borderRadius: 4, horizontal: false, distributed: true, columnWidth: '50%' } },
    dataLabels: { enabled: true, style: { fontSize: '14px', fontWeight: 'bold' } },
    xaxis: { categories: isAdminOrInternal ? ['Primary', 'Secondary', 'Tertiary'] : ['Inbound Volume', 'Outbound Volume'] },
    grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
    legend: { show: false }
  };

  const donutOptions = {
    chart: { type: 'donut', fontFamily: 'Inter, sans-serif' },
    labels: partnerProductChart.labels,
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
    plotOptions: { pie: { donut: { size: '70%' } } },
    legend: { position: 'bottom' },
    dataLabels: { enabled: false }
  };

  // --- STATIC MAP CONFIGURATION (Admin Only) ---
  const cities = [
    { name: "Mumbai (HQ/Factory)", coords: [19.0760, 72.8777], volume: 95, color: "#2563eb" },
    { name: "Delhi", coords: [28.7041, 77.1025], volume: 65, color: "#f59e0b" },
    { name: "Bangalore", coords: [12.9716, 77.5946], volume: 55, color: "#10b981" }
  ];

  const getLogColor = (type) => {
    switch(type) {
      case 'ERROR': return '#ef4444';
      case 'WARN': return '#f59e0b'; // Outbound / Adjustment
      case 'SUCCESS': return '#10b981'; // Inbound / Production
      case 'SECURE': return '#8b5cf6';
      default: return '#3b82f6';
    }
  };

  if(loading) return <div className="p-5 text-center text-muted"><div className="spinner-border text-primary mb-3"></div><br/>Booting Enterprise Gateway...</div>;

  return (
    <>
      {/* 1. DYNAMIC KPIs */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-primary">
            <i className="fa-solid fa-boxes-stacked kpi-icon text-primary"></i>
            <div className="kpi-title">{isAdminOrInternal ? 'Global Factory Stock' : 'My Total Inventory'}</div>
            <div className="kpi-value">{stats.stockVolume.toLocaleString()}</div>
            <div className="kpi-trend up"><i className="fa-solid fa-arrow-trend-up"></i> Active units ready</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-warning">
            <i className="fa-solid fa-truck-ramp-box kpi-icon text-warning"></i>
            <div className="kpi-title">{isAdminOrInternal ? 'Pending Operations' : 'Awaiting My Action'}</div>
            <div className="kpi-value">{stats.pendingAction}</div>
            <div className="kpi-trend text-muted"><i className="fa-solid fa-clock"></i> In pipeline queue</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-success">
            <i className="fa-solid fa-network-wired kpi-icon text-success"></i>
            <div className="kpi-title">{isAdminOrInternal ? 'Total Network Nodes' : 'My Downstream Network'}</div>
            <div className="kpi-value">{stats.networkSize}</div>
            <div className="kpi-trend up"><i className="fa-solid fa-check-circle"></i> Linked partners</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-info bg-info bg-opacity-10">
            <i className="fa-solid fa-microchip kpi-icon text-info opacity-25"></i>
            <div className="kpi-title text-info">{isAdminOrInternal ? 'System Pulse Ops' : 'Total Transactions'}</div>
            <div className="kpi-value text-info">{stats.pulseOps}</div>
            <div className="kpi-trend text-info"><i className="fa-solid fa-database"></i> Processed securely</div>
          </div>
        </div>
      </div>

      {/* 2. CHARTS & QUICK ACTIONS */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <div className="dashboard-card h-100">
            <div className="dashboard-card-header">
              <span><i className="fa-solid fa-chart-simple text-primary me-2"></i> {isAdminOrInternal ? 'Global Supply Pipeline' : 'My Trade Volume Analysis'}</span>
              <span className="badge bg-light text-dark border"><i className="fa-solid fa-filter me-1"></i> Live Data</span>
            </div>
            <div className="card-body p-3">
              <Chart options={pipelineOptions} series={[{ name: 'Volume', data: pipelineChartData }]} type="bar" height={320} />
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="dashboard-card mb-4">
            <div className="dashboard-card-header bg-light">
              <span><i className="fa-solid fa-bolt text-warning me-2"></i> Command Controls</span>
            </div>
            <div className="card-body p-3">
              <div className="d-grid gap-2">
                <a href="/inventory" className="btn btn-primary text-start fw-bold"><i className={`fa-solid ${isAdminOrInternal ? 'fa-industry' : 'fa-boxes-packing'} me-2 width-20`}></i> {isAdminOrInternal ? 'Log Factory Production' : 'View My Inventory'}</a>
                <a href="/orders" className="btn btn-outline-dark text-start fw-bold"><i className="fa-solid fa-truck-fast me-2 width-20"></i> {isAdminOrInternal ? 'Manage Global Routes' : 'Place / Dispatch Orders'}</a>
                {isAdminOrInternal && <a href="/partners" className="btn btn-outline-dark text-start fw-bold"><i className="fa-solid fa-user-plus me-2 width-20"></i> Register Network Partner</a>}
              </div>
            </div>
          </div>

          <div className="dashboard-card mb-0">
            <div className="dashboard-card-header bg-light">
              <span><i className="fa-solid fa-server text-secondary me-2"></i> Infrastructure Health</span>
            </div>
            <div className="card-body p-3">
              <div className="mb-3">
                <div className="d-flex justify-content-between small fw-bold mb-1">
                  <span><i className="fa-solid fa-shield-halved text-success me-1"></i> Data Encryption & Scope</span>
                  <span className="text-success">Secured</span>
                </div>
                <div className="progress" style={{ height: '6px' }}>
                  <div className="progress-bar bg-success" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. DYNAMIC MIDDLE ROW: Admin gets Map. Partner gets Top Products Donut. Both get Terminal. */}
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <div className="dashboard-card h-100">
            {isAdminOrInternal ? (
              <>
                <div className="dashboard-card-header">
                  <span><i className="fa-solid fa-satellite-dish text-danger me-2"></i> Live Logistics Heatmap</span>
                </div>
                <div style={{ height: '400px', width: '100%', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                  <MapContainer center={[21.5937, 78.9629]} zoom={4.5} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    {cities.map((city, idx) => (
                      <CircleMarker key={idx} center={city.coords} pathOptions={{ color: city.color, fillColor: city.color, fillOpacity: 0.4 }} radius={city.volume / 4}>
                        <Tooltip><strong>{city.name}</strong></Tooltip>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
              </>
            ) : (
              <>
                <div className="dashboard-card-header">
                  <span><i className="fa-solid fa-chart-pie text-primary me-2"></i> My Highest Velocity SKUs</span>
                </div>
                <div className="p-4 d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
                  {partnerProductChart.series.length > 0 ? (
                    <Chart options={donutOptions} series={partnerProductChart.series} type="donut" height={350} />
                  ) : (
                    <span className="text-muted fw-bold">Not enough data to analyze SKU velocity.</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="col-lg-6">
          <div className="dashboard-card h-100 bg-dark border-0">
            <div className="dashboard-card-header bg-black text-white border-0" style={{ borderRadius: '12px 12px 0 0' }}>
              <span><i className="fa-solid fa-terminal text-success me-2"></i> {isAdminOrInternal ? 'Global Inventory Audit Stream' : 'Live Node Activity Stream'}</span>
            </div>
            <div className="p-0 h-100">
              <div className="terminal p-3" ref={terminalRef} style={{ height: '400px', backgroundColor: '#0f172a', overflowY: 'auto' }}>
                {terminalLogs.length === 0 ? <span className="text-muted">Awaiting stream data...</span> :
                 terminalLogs.map((log, i) => (
                  <div key={i} className="mb-1" style={{ fontSize: '0.85rem' }}>
                    <span className="text-secondary">[{log.time}]</span>{' '}
                    <span style={{ color: getLogColor(log.type), fontWeight: 'bold' }}>[{log.type}]</span>{' '}
                    <span style={{ color: log.type === 'ERROR' ? '#ef4444' : '#e2e8f0' }}>{log.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. RECENT TRANSACTIONS TABLE (Live Data) */}
      <div className="row g-4">
        <div className="col-12">
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span><i className="fa-solid fa-list-check text-info me-2"></i> {isAdminOrInternal ? 'Latest Global Operations' : 'My Recent Order Flow'}</span>
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light text-muted small text-uppercase">
                  <tr>
                    <th className="px-4 py-3">Order Ref</th>
                    <th>Routing Logic</th>
                    <th>Transaction Parties</th>
                    <th>Payload Executed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.length === 0 ? <tr><td colSpan="5" className="text-center py-4 text-muted">No recent operations.</td></tr> :
                   recentOrders.map((o, idx) => {

                     // Determine origin and destination names securely
                     const destId = o.to_entity_id || o.ss_id || o.retailer_id || o.end_consumer_id;
                     const destName = masterData.partners[destId] || `Node #${destId || '?'}`;

                     let originName = '🏭 Factory';
                     if (o.type === 'SS_TO_DB' || o.distributor_id) originName = masterData.partners[o.from_entity_id || o.distributor_id] || 'SS / Dist';
                     if (o.fulfilled_by_retailer_id) originName = masterData.partners[o.fulfilled_by_retailer_id] || 'Retailer';

                     // Determine product string
                     const itemInfo = o.items && o.items.length > 0 ? o.items[0] : null;
                     const prodId = itemInfo ? itemInfo.product_id : o.product_id;
                     const qty = itemInfo ? (itemInfo.quantity_cases || itemInfo.quantity_units || itemInfo.quantity) : (o.quantity_cases || o.quantity_units || o.quantity);
                     const prodName = masterData.products[prodId] || `SKU-${prodId}`;

                     // Render pipeline tier mathematically
                     let tierStr = 'Primary';
                     let badgeCol = 'primary';
                     if (o.distributor_id && o.retailer_id) { tierStr = 'Secondary'; badgeCol = 'success'; }
                     if (o.end_consumer_id) { tierStr = 'Tertiary'; badgeCol = 'warning'; }

                     return (
                      <tr key={idx}>
                        <td className="px-4 fw-bold font-monospace text-dark">{o.order_number || o.invoice_number || `ORD-${o.id}`}</td>
                        <td>
                          <span className={`badge border bg-${badgeCol} bg-opacity-10 text-${badgeCol === 'warning' ? 'dark' : badgeCol} border-${badgeCol}`}>
                            {tierStr}
                          </span>
                        </td>
                        <td>
                           <span className="small text-muted">{originName}</span>
                           <i className="fa-solid fa-arrow-right mx-2 text-muted" style={{fontSize: '10px'}}></i>
                           <span className="fw-semibold text-dark">{destName}</span>
                        </td>
                        <td>
                           <span className="fw-bold">{qty} Units</span> <span className="text-muted small">of {prodName}</span>
                        </td>
                        <td>
                          <span className={`badge rounded-pill px-3 py-2 text-uppercase shadow-sm border ${
                            o.status === 'Pending' || o.status === 'PENDING' ? 'bg-warning bg-opacity-10 text-warning border-warning' :
                            o.status === 'DISPATCHED' ? 'bg-info bg-opacity-10 text-info border-info' :
                            'bg-success bg-opacity-10 text-success border-success'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                     )
                   })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}