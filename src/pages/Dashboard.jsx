import React, { useState, useEffect, useRef } from 'react';
import Chart from 'react-apexcharts';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import api from '../api';

export default function Dashboard() {
  const terminalRef = useRef(null);

  // --- LIVE DATA STATES ---
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalFactoryStock: 0,
    pendingPrimary: 0,
    totalPartners: 0,
    recentLedgerCount: 0
  });
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [chartData, setChartData] = useState({ primary: 0, secondary: 0, tertiary: 0 });

  // --- MASTER DATA TRANSLATORS ---
  const [masterData, setMasterData] = useState({ products: [], partners: {} });

  // --- DATA HYDRATION ---
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        // 1. Fetch all required endpoints in parallel for speed
        const [
          factoryRes, ledgerRes, primaryRes, secondaryRes, tertiaryRes,
          prodRes, ssRes, distRes, retRes
        ] = await Promise.all([
          api.get('/inventory/factory/1').catch(() => ({ data: [] })),
          api.get('/inventory/ledger').catch(() => ({ data: [] })),
          api.get('/primary-orders/').catch(() => ({ data: [] })),
          api.get('/secondary-sales/').catch(() => ({ data: [] })),
          api.get('/tertiary-sales/').catch(() => ({ data: [] })),
          api.get('/products').catch(() => ({ data: [] })),
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] }))
        ]);

        // Normalize Data
        const fStock = Array.isArray(factoryRes.data) ? factoryRes.data : factoryRes.data?.items || [];
        const ledger = Array.isArray(ledgerRes.data) ? ledgerRes.data : ledgerRes.data?.items || [];
        const pOrders = Array.isArray(primaryRes.data) ? primaryRes.data : primaryRes.data?.items || [];
        const sOrders = Array.isArray(secondaryRes.data) ? secondaryRes.data : secondaryRes.data?.items || [];
        const tOrders = Array.isArray(tertiaryRes.data) ? tertiaryRes.data : tertiaryRes.data?.items || [];

        const ss = Array.isArray(ssRes.data) ? ssRes.data : ssRes.data?.items || [];
        const dist = Array.isArray(distRes.data) ? distRes.data : distRes.data?.items || [];
        const ret = Array.isArray(retRes.data) ? retRes.data : retRes.data?.items || [];
        const products = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.items || [];

        // Build a dictionary for easy ID lookup later
        const allPartners = {};
        [...ss, ...dist, ...ret].forEach(p => { allPartners[p.id] = p.name || p.firm_name || p.shop_name });

        const productDict = {};
        products.forEach(p => { productDict[p.id] = p.name || p.product_name });

        setMasterData({ products: productDict, partners: allPartners });

        // --- CALCULATE KPIs ---
        const totalStock = fStock.reduce((sum, item) => sum + (item.current_stock_qty || item.current_stock || 0), 0);
        const pendingP = pOrders.filter(o => (o.status || '').toUpperCase() === 'PENDING').length;

        setStats({
          totalFactoryStock: totalStock,
          pendingPrimary: pendingP,
          totalPartners: ss.length + dist.length + ret.length,
          recentLedgerCount: ledger.length
        });

        setChartData({ primary: pOrders.length, secondary: sOrders.length, tertiary: tOrders.length });

        // --- BUILD RECENT ORDERS TABLE ---
        // Combine primary and secondary, sort by ID descending, grab top 5
        let combined = [
          ...pOrders.map(o => ({ ...o, tier: 'Primary' })),
          ...sOrders.map(o => ({ ...o, tier: 'Secondary' }))
        ];
        combined.sort((a, b) => b.id - a.id);
        setRecentOrders(combined.slice(0, 5));

        // --- BUILD TERMINAL LOGS FROM LEDGER ---
        // Reverse so oldest is at top, newest at bottom of the terminal
        const formattedLogs = ledger.slice(0, 20).reverse().map(l => {
           let type = 'INFO';
           if(l.transaction_type === 'PRODUCTION') type = 'SUCCESS';
           if(l.transaction_type === 'ADJUSTMENT') type = 'WARN';

           const d = l.quantity_change > 0 ? `+${l.quantity_change}` : l.quantity_change;
           const prodName = productDict[l.product_id] || `PRD-${l.product_id}`;
           return {
             time: new Date(l.created_at).toLocaleTimeString(),
             type: type,
             msg: `[${l.entity_type.toUpperCase()}] ${l.transaction_type}: ${d} units of ${prodName}. Bal: ${l.closing_balance}`
           }
        });

        // Add boot sequence logs
        setTerminalLogs([
          { time: new Date().toLocaleTimeString(), type: 'SECURE', msg: "HOM ERP Core v2.0 Initialized..." },
          { time: new Date().toLocaleTimeString(), type: 'INFO', msg: "Connected to PostgreSQL Database Cluster." },
          ...formattedLogs
        ]);

      } catch (err) {
        console.error("Dashboard hydration failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);


  // --- CHART CONFIGURATION (Now uses live data totals) ---
  const chartOptions = {
    chart: { type: 'bar', toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
    colors: ['#2563eb', '#10b981', '#f59e0b'],
    plotOptions: { bar: { borderRadius: 4, horizontal: false, distributed: true } },
    dataLabels: { enabled: true, style: { fontSize: '14px', fontWeight: 'bold' } },
    xaxis: { categories: ['Primary Pipeline', 'Secondary Pipeline', 'Tertiary Pipeline'] },
    grid: { borderColor: '#f1f5f9', strokeDashArray: 4 }
  };

  const chartSeries = [{
    name: 'Total Orders Processed',
    data: [chartData.primary, chartData.secondary, chartData.tertiary]
  }];

  // --- STATIC MAP CONFIGURATION ---
  const cities = [
    { name: "Mumbai (HQ/Factory)", coords: [19.0760, 72.8777], volume: 95, color: "#2563eb", status: "Optimal" },
    { name: "Delhi (Super Stockist)", coords: [28.7041, 77.1025], volume: 65, color: "#f59e0b", status: "High Load" },
    { name: "Bangalore (Distributor)", coords: [12.9716, 77.5946], volume: 55, color: "#10b981", status: "Optimal" }
  ];

  const getLogColor = (type) => {
    switch(type) {
      case 'ERROR': return '#ef4444';
      case 'WARN': return '#f59e0b';
      case 'SUCCESS': return '#10b981';
      case 'SECURE': return '#8b5cf6';
      default: return '#94a3b8';
    }
  };

  if(loading) return <div className="p-5 text-center text-muted"><div className="spinner-border mb-3"></div><br/>Booting Enterprise Gateway...</div>;

  return (
    <>
      {/* 1. TOP KPIs (Live Data) */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-primary">
            <i className="fa-solid fa-industry kpi-icon text-primary"></i>
            <div className="kpi-title">Global Factory Stock</div>
            <div className="kpi-value">{stats.totalFactoryStock.toLocaleString()}</div>
            <div className="kpi-trend up"><i className="fa-solid fa-boxes-stacked"></i> Units ready for dispatch</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-warning">
            <i className="fa-solid fa-truck-ramp-box kpi-icon text-warning"></i>
            <div className="kpi-title">Pending Primary Routes</div>
            <div className="kpi-value">{stats.pendingPrimary}</div>
            <div className="kpi-trend text-muted"><i className="fa-solid fa-clock"></i> Awaiting logistics execution</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-success">
            <i className="fa-solid fa-network-wired kpi-icon text-success"></i>
            <div className="kpi-title">Active Network Nodes</div>
            <div className="kpi-value">{stats.totalPartners}</div>
            <div className="kpi-trend up"><i className="fa-solid fa-check-circle"></i> Registered Supply Partners</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-info bg-info bg-opacity-10">
            <i className="fa-solid fa-microchip kpi-icon text-info opacity-25"></i>
            <div className="kpi-title text-info">Ledger Operations</div>
            <div className="kpi-value text-info">{stats.recentLedgerCount}</div>
            <div className="kpi-trend text-info"><i className="fa-solid fa-database"></i> Indexed Inventory Movements</div>
          </div>
        </div>
      </div>

      {/* 2. CHARTS & QUICK ACTIONS */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <div className="dashboard-card h-100">
            <div className="dashboard-card-header">
              <span><i className="fa-solid fa-chart-simple text-primary me-2"></i> Supply Pipeline Volume</span>
              <span className="badge bg-light text-dark border"><i className="fa-solid fa-filter me-1"></i> Live Data</span>
            </div>
            <div className="card-body p-3">
              <Chart options={chartOptions} series={chartSeries} type="bar" height={320} />
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
                <a href="/inventory" className="btn btn-primary text-start"><i className="fa-solid fa-industry me-2 width-20"></i> Log Factory Production</a>
                <a href="/orders" className="btn btn-outline-dark text-start"><i className="fa-solid fa-truck-fast me-2 width-20"></i> Dispatch Pending Routes</a>
                <a href="/partners" className="btn btn-outline-dark text-start"><i className="fa-solid fa-user-plus me-2 width-20"></i> Register Network Partner</a>
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
                  <span><i className="fa-solid fa-database text-primary me-1"></i> Database Cluster Load</span>
                  <span className="text-success">Optimal</span>
                </div>
                <div className="progress" style={{ height: '6px' }}>
                  <div className="progress-bar bg-success" style={{ width: '15%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. HEATMAP & TERMINAL (Live Data) */}
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <div className="dashboard-card h-100">
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
          </div>
        </div>

        <div className="col-lg-6">
          <div className="dashboard-card h-100 bg-dark border-0">
            <div className="dashboard-card-header bg-black text-white border-0" style={{ borderRadius: '12px 12px 0 0' }}>
              <span><i className="fa-solid fa-terminal text-success me-2"></i> Global Inventory Audit Stream</span>
            </div>
            <div className="p-0 h-100">
              <div className="terminal p-3" ref={terminalRef} style={{ height: '400px', backgroundColor: '#0f172a' }}>
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
              <span><i className="fa-solid fa-list-check text-info me-2"></i> Latest Dispatch Operations</span>
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light text-muted small text-uppercase">
                  <tr>
                    <th className="px-4 py-3">Order Ref</th>
                    <th>Route Vector</th>
                    <th>Destination Node</th>
                    <th>Payload</th>
                    <th>Pipeline Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.length === 0 ? <tr><td colSpan="5" className="text-center py-4 text-muted">No recent operations.</td></tr> :
                   recentOrders.map((o, idx) => {
                     // Determine destination
                     const destId = o.to_entity_id || o.ss_id || o.retailer_id;
                     const destName = masterData.partners[destId] || `Node #${destId}`;

                     // Determine product
                     const itemInfo = o.items && o.items.length > 0 ? o.items[0] : null;
                     const prodId = itemInfo ? itemInfo.product_id : o.product_id;
                     const qty = itemInfo ? (itemInfo.quantity_cases || itemInfo.quantity) : o.quantity;
                     const prodName = masterData.products[prodId] || `SKU-${prodId}`;

                     return (
                      <tr key={idx}>
                        <td className="px-4 fw-bold font-monospace text-dark">{o.order_number || `ORD-${o.id}`}</td>
                        <td>
                          <span className={`badge border ${o.tier === 'Primary' ? 'bg-primary bg-opacity-10 text-primary border-primary' : 'bg-success bg-opacity-10 text-success border-success'}`}>
                            {o.tier}
                          </span>
                        </td>
                        <td className="fw-semibold">{destName}</td>
                        <td>
                           <span className="fw-bold">{qty} Units</span> of {prodName}
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