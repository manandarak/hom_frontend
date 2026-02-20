import React, { useState, useEffect, useRef } from 'react';
import Chart from 'react-apexcharts';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';

export default function Dashboard() {
  const terminalRef = useRef(null);

  // Terminal State with Color Coding
  const [logs, setLogs] = useState([
    { type: 'INFO', msg: "HOM ERP Core v2.0 Initialized..." },
    { type: 'SECURE', msg: "Establishing secure wss:// connection to entities..." },
    { type: 'SUCCESS', msg: "Database cluster [hom_db_prod] connected successfully." }
  ]);

  const mockLogs = [
    { type: 'SUCCESS', msg: "POST /api/v1/primary-sales/ - 201 Created (Factory->SS)" },
    { type: 'INFO', msg: "GET /api/v1/inventory/retailer/432 - 200 OK" },
    { type: 'SUCCESS', msg: "PATCH /api/v1/tertiary-sales/so/101/approve - 200 OK" },
    { type: 'SECURE', msg: "RBAC CHECK: User #492 (Retailer) -> Granted" },
    { type: 'WARN', msg: "SYNC DELAY: Node #82 (Delhi) response time > 400ms" },
    { type: 'ERROR', msg: "AUTH FAILURE: Invalid token from IP 192.168.1.44" },
    { type: 'INFO', msg: "CRON: Master Ledger Auto-Update Successful" },
    { type: 'SUCCESS', msg: "AI AGENT: Demand forecast generated for Q3" }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      const randomLog = mockLogs[Math.floor(Math.random() * mockLogs.length)];
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [...prev.slice(-49), { time, ...randomLog }]); // Keep last 50 logs
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // --- CHART CONFIGURATION ---
  const chartOptions = {
    chart: { type: 'area', toolbar: { show: false }, fontFamily: 'Inter, sans-serif' },
    colors: ['#2563eb', '#f59e0b', '#10b981'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 90, 100] } },
    xaxis: { categories: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
    yaxis: { labels: { formatter: (value) => "₹" + value + "k" } },
    legend: { position: 'top', horizontalAlign: 'right' },
    grid: { borderColor: '#f1f5f9', strokeDashArray: 4 }
  };

  const chartSeries = [
    { name: 'Primary Sales (Factory)', data: [310, 400, 280, 510, 420, 690, 800, 750, 920] },
    { name: 'Secondary (Distributors)', data: [210, 260, 220, 340, 280, 450, 520, 480, 610] },
    { name: 'Tertiary (Retailers)', data: [150, 180, 160, 240, 190, 310, 380, 340, 450] }
  ];

  // --- MAP CONFIGURATION ---
  const cities = [
    { name: "Mumbai (HQ/Factory)", coords: [19.0760, 72.8777], volume: 95, color: "#2563eb", status: "Optimal" },
    { name: "Delhi (Super Stockist)", coords: [28.7041, 77.1025], volume: 65, color: "#f59e0b", status: "High Load" },
    { name: "Bangalore (Distributor)", coords: [12.9716, 77.5946], volume: 55, color: "#10b981", status: "Optimal" },
    { name: "Kolkata (Distributor)", coords: [22.5726, 88.3639], volume: 40, color: "#10b981", status: "Optimal" },
    { name: "Chennai (Retail Hub)", coords: [13.0827, 80.2707], volume: 30, color: "#ef4444", status: "Low Stock" },
    { name: "Ahmedabad (Factory B)", coords: [23.0225, 72.5714], volume: 75, color: "#2563eb", status: "Optimal" },
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

  return (
    <>
      {/* 1. TOP KPIs */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-primary">
            <i className="fa-solid fa-indian-rupee-sign kpi-icon text-primary"></i>
            <div className="kpi-title">YTD Revenue</div>
            <div className="kpi-value">₹42.8 Cr</div>
            <div className="kpi-trend up"><i className="fa-solid fa-arrow-trend-up"></i> +14.5% vs last month</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-success">
            <i className="fa-solid fa-boxes-stacked kpi-icon text-success"></i>
            <div className="kpi-title">Active Inventory Value</div>
            <div className="kpi-value">₹18.2 Cr</div>
            <div className="kpi-trend up"><i className="fa-solid fa-check-circle"></i> Turnaround: 14 Days</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-warning">
            <i className="fa-solid fa-truck-fast kpi-icon text-warning"></i>
            <div className="kpi-title">In-Transit Value</div>
            <div className="kpi-value">₹3.4 Cr</div>
            <div className="kpi-trend text-muted"><i className="fa-solid fa-clock"></i> 412 Active Shipments</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="kpi-card border-start border-4 border-danger bg-danger bg-opacity-10">
            <i className="fa-solid fa-brain kpi-icon text-danger opacity-25"></i>
            <div className="kpi-title text-danger">AI Anomalies Detected</div>
            <div className="kpi-value text-danger">3 Alerts</div>
            <div className="kpi-trend down"><i className="fa-solid fa-triangle-exclamation"></i> Action Required</div>
          </div>
        </div>
      </div>

      {/* 2. CHARTS & QUICK ACTIONS */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <div className="dashboard-card h-100">
            <div className="dashboard-card-header">
              <span><i className="fa-solid fa-chart-area text-primary me-2"></i> Pan-India Sales Pipeline</span>
              <span className="badge bg-light text-dark border"><i className="fa-solid fa-filter me-1"></i> FY 2025-26</span>
            </div>
            <div className="card-body p-3">
              <Chart options={chartOptions} series={chartSeries} type="area" height={320} />
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          {/* Quick Actions Panel */}
          <div className="dashboard-card mb-4">
            <div className="dashboard-card-header bg-light">
              <span><i className="fa-solid fa-bolt text-warning me-2"></i> Command Controls</span>
            </div>
            <div className="card-body p-3">
              <div className="d-grid gap-2">
                <button className="btn btn-primary text-start"><i className="fa-solid fa-box-open me-2 width-20"></i> Provision New Product</button>
                <button className="btn btn-outline-dark text-start"><i className="fa-solid fa-user-plus me-2 width-20"></i> Register Network Partner</button>
                <button className="btn btn-outline-dark text-start"><i className="fa-solid fa-file-invoice-dollar me-2 width-20"></i> Generate Tax Compliance Report</button>
              </div>
            </div>
          </div>

          {/* System Health Panel */}
          <div className="dashboard-card mb-0">
            <div className="dashboard-card-header bg-light">
              <span><i className="fa-solid fa-server text-secondary me-2"></i> Infrastructure Health</span>
            </div>
            <div className="card-body p-3">
              <div className="mb-3">
                <div className="d-flex justify-content-between small fw-bold mb-1">
                  <span><i className="fa-solid fa-database text-primary me-1"></i> RDS PostgreSQL Cluster</span>
                  <span className="text-success">22ms</span>
                </div>
                <div className="progress" style={{ height: '6px' }}>
                  <div className="progress-bar bg-success" style={{ width: '15%' }}></div>
                </div>
              </div>
              <div>
                <div className="d-flex justify-content-between small fw-bold mb-1">
                  <span><i className="fa-solid fa-microchip text-danger me-1"></i> API Gateway Load</span>
                  <span className="text-warning">78%</span>
                </div>
                <div className="progress" style={{ height: '6px' }}>
                  <div className="progress-bar bg-warning" style={{ width: '78%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. HEATMAP & TERMINAL */}
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <div className="dashboard-card h-100">
            <div className="dashboard-card-header">
              <span><i className="fa-solid fa-satellite-dish text-danger me-2"></i> Live Logistics & Supply Heatmap</span>
              <span className="spinner-grow spinner-grow-sm text-danger" role="status"></span>
            </div>
            <div style={{ height: '400px', width: '100%', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
              <MapContainer center={[21.5937, 78.9629]} zoom={4.5} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                {cities.map((city, idx) => (
                  <CircleMarker
                    key={idx}
                    center={city.coords}
                    pathOptions={{ color: city.color, fillColor: city.color, fillOpacity: 0.4 }}
                    radius={city.volume / 4}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                      <strong>{city.name}</strong><br/>
                      Status: <span style={{color: city.status === 'Low Stock' ? 'red' : 'green'}}>{city.status}</span>
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="dashboard-card h-100 bg-dark border-0">
            <div className="dashboard-card-header bg-black text-white border-0" style={{ borderRadius: '12px 12px 0 0' }}>
              <span><i className="fa-solid fa-terminal text-success me-2"></i> System Activity Stream</span>
              <button className="btn btn-sm btn-outline-secondary py-0" onClick={() => setLogs([])}>Clear</button>
            </div>
            <div className="p-0 h-100">
              <div className="terminal p-3" ref={terminalRef} style={{ height: '400px', backgroundColor: '#0f172a' }}>
                {logs.map((log, i) => (
                  <div key={i} className="mb-1" style={{ fontSize: '0.85rem' }}>
                    <span className="text-secondary">[{log.time || new Date().toLocaleTimeString()}]</span>{' '}
                    <span style={{ color: getLogColor(log.type), fontWeight: 'bold' }}>[{log.type}]</span>{' '}
                    <span style={{ color: log.type === 'ERROR' ? '#ef4444' : '#e2e8f0' }}>{log.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. RECENT TRANSACTIONS TABLE */}
      <div className="row g-4">
        <div className="col-12">
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <span><i className="fa-solid fa-list-check text-info me-2"></i> Recent Supply Chain Operations</span>
              <button className="btn btn-sm btn-primary py-0">View All Master Ledgers</button>
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light text-muted small text-uppercase">
                  <tr>
                    <th className="px-4 py-3">Order ID</th>
                    <th>Type</th>
                    <th>Origin Node</th>
                    <th>Destination Node</th>
                    <th>Amount (₹)</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 fw-bold text-primary">#PO-8842</td>
                    <td><span className="badge bg-primary bg-opacity-10 text-primary border border-primary">Primary</span></td>
                    <td>Mumbai Factory HQ</td>
                    <td>Delhi Super Stockist</td>
                    <td>₹12,45,000</td>
                    <td><span className="badge bg-warning text-dark"><i className="fa-solid fa-truck-fast me-1"></i> In Transit</span></td>
                    <td><button className="btn btn-sm btn-light border"><i className="fa-solid fa-eye"></i></button></td>
                  </tr>
                  <tr>
                    <td className="px-4 fw-bold text-primary">#SO-9921</td>
                    <td><span className="badge bg-success bg-opacity-10 text-success border border-success">Secondary</span></td>
                    <td>Delhi Super Stockist</td>
                    <td>Gurgaon Distributor #4</td>
                    <td>₹4,20,500</td>
                    <td><span className="badge bg-success"><i className="fa-solid fa-check me-1"></i> Delivered</span></td>
                    <td><button className="btn btn-sm btn-light border"><i className="fa-solid fa-eye"></i></button></td>
                  </tr>
                  <tr>
                    <td className="px-4 fw-bold text-primary">#TO-1102</td>
                    <td><span className="badge bg-info bg-opacity-10 text-info border border-info">Tertiary</span></td>
                    <td>Bangalore Distributor</td>
                    <td>Retailer #882 (Indiranagar)</td>
                    <td>₹85,000</td>
                    <td><span className="badge bg-secondary"><i className="fa-solid fa-clock me-1"></i> Pending Auth</span></td>
                    <td><button className="btn btn-sm btn-light border"><i className="fa-solid fa-eye"></i></button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}