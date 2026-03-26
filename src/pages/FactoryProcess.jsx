import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

// --- CONSTANTS: The 16 Stages of Razor Blade Manufacturing ---
const STAGES = [
  { id: 1, name: 'Punching', inUOM: 'KG', outUOM: 'KG' },
  { id: 2, name: 'Hardening / Furnace', inUOM: 'KG', outUOM: 'KG' },
  { id: 3, name: 'Coil Joining', inUOM: 'KG', outUOM: 'KG' },
  { id: 4, name: 'Passivation', inUOM: 'KG', outUOM: 'KG' },
  { id: 5, name: 'Printing', inUOM: 'KG', outUOM: 'KG' },
  { id: 6, name: 'Grinder / Stropper', inUOM: 'KG', outUOM: 'NOS', isConversion: true },
  { id: 7, name: 'Heat Cleaning', inUOM: 'NOS', outUOM: 'NOS' },
  { id: 8, name: 'Sputtering', inUOM: 'NOS', outUOM: 'NOS' }, // Corrected Order: Hard coat first
  { id: 9, name: 'Spray Unit', inUOM: 'NOS', outUOM: 'NOS' }, // Corrected Order: Teflon spray second
  { id: 10, name: 'Sintering', inUOM: 'NOS', outUOM: 'NOS' }, // Corrected Order: Bake to cure
  { id: 11, name: 'Oil Bath', inUOM: 'NOS', outUOM: 'NOS' },
  { id: 12, name: 'Wrapping', inUOM: 'NOS', outUOM: 'TUCKS', isConversion: true },
  { id: 13, name: 'Pocketing', inUOM: 'TUCKS', outUOM: 'TUCKS' },
  { id: 14, name: 'Cellophaning', inUOM: 'TUCKS', outUOM: 'TUCKS' },
  { id: 15, name: 'Shrink wrapping / packing', inUOM: 'TUCKS', outUOM: 'BOXES', isConversion: true },
  { id: 16, name: 'Store / Final FG Intake', inUOM: 'BOXES', outUOM: 'BOXES', isFinal: true }
];

export default function FactoryProcess() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('flowchart');
  const [selectedStage, setSelectedStage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // --- MASTER DATA ---
  const [products, setProducts] = useState([]);
  const rmProducts = products.filter(p => p.item_type === 'RM'); // Only Raw Materials

  // --- WIP & LEDGER STATE ---
  const [wipData, setWipData] = useState([]);
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // --- FORMS ---
  const [intakeForm, setIntakeForm] = useState({
    factory_id: 1,
    product_id: '', // Dynamically selected
    vendor_lot_number: '',
    invoice_qty: '',
    uom: 'KG',
    batch_number: ''
  });

  const [executeForm, setExecuteForm] = useState({
    good_output_qty: '',
    scrap_qty: 0,
    selectedWips: {}
  });

  // Derived state to prevent mixing different products in one run
  const activeWipProductId = wipData.find(w => executeForm.selectedWips[w.id])?.product_id || null;

  // --- INITIAL LOAD ---
  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (activeTab === 'wip' || activeTab === 'execute') fetchWIP(selectedStage);
    if (activeTab === 'ledger') fetchLedger();
  }, [activeTab, selectedStage]);

  // --- API CALLS ---
  const fetchProducts = async () => {
    try {
      const response = await api.get('/products/');
      setProducts(response.data || []);
    } catch (error) {
      console.error("Failed to fetch products", error);
    }
  };

  const fetchWIP = async (stageId) => {
    setLoading(true);
    try {
      const response = await api.get(`/production/wip/available/${stageId}`);
      setWipData(response.data || []);
      setExecuteForm(prev => ({ ...prev, selectedWips: {} }));
    } catch (error) {
      console.error("Failed to fetch WIP", error);
      setWipData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLedger = async () => {
    setLedgerLoading(true);
    try {
      const response = await api.get(`/production/ledger/1`);
      const formattedData = response.data.map(item => ({
        ...item,
        entity_type: 'FACTORY_WIP',
        sku: item.sku ? `SKU: ${item.sku} | Stage: ${item.stage_id || 'N/A'}` : `Stage: ${item.stage_id || 'N/A'}`
      }));
      setLedgerData(formattedData);
    } catch (error) {
      setMessage({ text: 'Failed to load ledger data.', type: 'danger' });
      setLedgerData([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  // --- HANDLERS ---
  const handleIntakeSubmit = async (e) => {
    e.preventDefault();
    if (!intakeForm.product_id) return setMessage({ text: 'Please select a Raw Material.', type: 'warning' });

    setLoading(true);
    try {
      await api.post('/production/intake-raw-material', {
        ...intakeForm,
        invoice_qty: parseFloat(intakeForm.invoice_qty),
        operator_id: user?.id || 1,
        batch_number: intakeForm.vendor_lot_number || `RM-INTAKE-${Date.now()}`
      });
      setMessage({ text: 'Raw material successfully logged and queued.', type: 'success' });
      setIntakeForm(prev => ({ ...prev, vendor_lot_number: '', invoice_qty: '', batch_number: '' }));
    } catch (error) {
      setMessage({ text: 'Failed to intake material.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleWipSelection = (wipId, wipProductId, checked, maxQty) => {
    // Prevent selecting WIP if it belongs to a different product than currently selected ones
    if (checked && activeWipProductId && activeWipProductId !== wipProductId) {
      return setMessage({ text: 'You cannot mix different products in a single run.', type: 'warning' });
    }

    setExecuteForm(prev => {
      const updated = { ...prev.selectedWips };
      if (checked) updated[wipId] = maxQty;
      else delete updated[wipId];
      return { ...prev, selectedWips: updated };
    });
  };

  const handleWipQtyChange = (wipId, val) => {
    setExecuteForm(prev => ({
      ...prev,
      selectedWips: { ...prev.selectedWips, [wipId]: parseFloat(val) || 0 }
    }));
  };

  const handleExecuteRun = async (e) => {
    e.preventDefault();
    setLoading(true);

    const consumed_wips = Object.keys(executeForm.selectedWips).map(id => ({
      wip_id: parseInt(id),
      qty_to_consume: executeForm.selectedWips[id]
    }));

    if (consumed_wips.length === 0) {
      setMessage({ text: 'You must select at least one WIP batch to consume.', type: 'warning' });
      setLoading(false); return;
    }

    const payload = {
      idempotency_key: crypto.randomUUID(),
      stage_id: selectedStage,
      factory_id: 1,
      operator_id: user?.id || 1,
      product_id: activeWipProductId, // Dynamically pulled from the selected WIP!
      consumed_wips: consumed_wips,
      good_output_qty: parseFloat(executeForm.good_output_qty),
      scrap_qty: parseFloat(executeForm.scrap_qty) || 0
    };

    try {
      await api.post('/production/execute-run', payload);
      setMessage({ text: `Stage ${selectedStage} executed successfully!`, type: 'success' });
      setExecuteForm({ good_output_qty: '', scrap_qty: 0, selectedWips: {} });
      fetchWIP(selectedStage);
    } catch (error) {
      setMessage({ text: error.response?.data?.detail || 'Execution failed.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleReverseRun = async (runId) => {
    if (!window.confirm(`Are you sure you want to reverse Run ID ${runId}? This will restore consumed WIP and delete output.`)) return;

    setLoading(true);
    try {
      await api.post(`/production/reverse-run/${runId}`);
      setMessage({ text: `Run ${runId} reversed successfully.`, type: 'success' });
      fetchLedger();
    } catch (error) {
      setMessage({ text: error.response?.data?.detail || 'Failed to reverse run.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleStageSelect = (stageId) => {
    setSelectedStage(stageId);
    setActiveTab('execute');
  };

  // --- RENDER HELPERS ---
  const stage = STAGES.find(s => s.id === selectedStage) || STAGES[0];
  const filteredLedger = ledgerData.filter(item =>
    item.batch_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.reference_document?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getQtyBadge = (qty, type) => {
    if (type?.includes('SCRAP')) return <span className="badge bg-danger text-white px-2 py-1"><i className="fa-solid fa-trash-can me-1"></i> {qty}</span>;
    if (qty > 0) return <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1">+{qty}</span>;
    if (qty < 0) return <span className="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 px-2 py-1">{qty}</span>;
    return <span className="badge bg-secondary">{qty}</span>;
  };

  return (
    <div className="p-4 bg-light min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
           <h2 className="fw-bolder text-dark mb-0"><i className="fa-solid fa-industry text-primary me-2"></i> Factory Execution System (MES)</h2>
           <p className="text-muted small mt-1">End-to-End Traceability & Production Routing</p>
        </div>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type} alert-dismissible fade show shadow-sm`} role="alert">
          {message.text}
          <button type="button" className="btn-close" onClick={() => setMessage({text:'', type:''})}></button>
        </div>
      )}

      {/* TABS */}
      <div className="overflow-auto pb-2 mb-4 custom-scrollbar">
        <ul className="nav nav-pills bg-white p-2 rounded-pill shadow-sm border flex-nowrap" style={{ width: 'fit-content' }}>
          {['flowchart', 'intake', 'execute', 'wip', 'ledger'].map(tab => (
            <li className="nav-item" key={tab}>
              <button
                className={`nav-link rounded-pill px-3 px-md-4 text-nowrap text-capitalize ${activeTab === tab ? 'active shadow-sm' : 'text-secondary'}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'intake' ? 'RM Intake' : tab}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* --- 1. FLOWCHART TAB --- */}
      {activeTab === 'flowchart' && (
        <div className="card border-0 shadow-sm rounded-4">
          <div className="card-body p-4">
            <h5 className="fw-bold mb-4 text-secondary">Razor Blade Production Pipeline</h5>
            <div className="d-flex flex-wrap gap-3 align-items-center justify-content-center">
              {STAGES.map((s, index) => (
                <React.Fragment key={s.id}>
                  {/* Stage Node */}
                  <div
                    onClick={() => handleStageSelect(s.id)}
                    className={`p-3 rounded-4 shadow-sm border text-center transition-all cursor-pointer hover-bg-light ${s.isFinal ? 'border-success border-2 bg-success bg-opacity-10' : s.isConversion ? 'border-warning border-2' : 'border-primary'}`}
                    style={{ width: '140px', cursor: 'pointer' }}
                  >
                    <div className="fw-bold fs-5 text-dark">{s.id}</div>
                    <div className="small fw-semibold mt-1" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>{s.name}</div>
                    <div className="mt-2 badge bg-light text-secondary border w-100">
                      {s.inUOM} <i className="fa-solid fa-arrow-right mx-1"></i> {s.outUOM}
                    </div>
                  </div>

                  {/* Arrow connector */}
                  {index < STAGES.length - 1 && (
                     <div className="text-muted"><i className="fa-solid fa-chevron-right fs-4 opacity-50"></i></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- 2. RM INTAKE TAB --- */}
      {activeTab === 'intake' && (
         <div className="card border-0 shadow-sm rounded-4 max-w-lg mx-auto" style={{ maxWidth: '600px' }}>
           <div className="card-body p-4 p-md-5">
             <h4 className="fw-bold mb-4">Receive Raw Material</h4>
             <form onSubmit={handleIntakeSubmit}>
               <div className="mb-3">
                 <label className="form-label text-muted small fw-bold">Select Material (RM Only)</label>
                 <select className="form-select bg-light" required value={intakeForm.product_id} onChange={e => setIntakeForm({...intakeForm, product_id: parseInt(e.target.value)})}>
                   <option value="">-- Choose Raw Material --</option>
                   {rmProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku_code})</option>)}
                 </select>
               </div>
               <div className="mb-3">
                 <label className="form-label text-muted small fw-bold">Vendor Lot / Invoice Number</label>
                 <input type="text" className="form-control bg-light" placeholder="e.g. JINDAL-ST-9928" required value={intakeForm.vendor_lot_number} onChange={e => setIntakeForm({...intakeForm, vendor_lot_number: e.target.value})} />
               </div>
               <div className="row mb-4">
                 <div className="col-8">
                   <label className="form-label text-muted small fw-bold">Total Weight/Qty Received</label>
                   <input type="number" step="0.01" className="form-control bg-light" required value={intakeForm.invoice_qty} onChange={e => setIntakeForm({...intakeForm, invoice_qty: e.target.value})} />
                 </div>
                 <div className="col-4">
                   <label className="form-label text-muted small fw-bold">UOM</label>
                   <input type="text" className="form-control" value={intakeForm.uom} onChange={e => setIntakeForm({...intakeForm, uom: e.target.value})} />
                 </div>
               </div>
               <button type="submit" disabled={loading} className="btn btn-primary w-100 py-2 fw-bold rounded-3">
                 {loading ? 'Processing...' : 'Intake & Queue for Routing Step 1'}
               </button>
             </form>
           </div>
         </div>
      )}

      {/* --- 3. EXECUTE RUN TAB --- */}
      {activeTab === 'execute' && (
        <div className="row g-4">
          <div className="col-12 col-xl-4">
             <div className="card border-0 shadow-sm rounded-4 h-100">
               <div className="card-header bg-white border-bottom-0 pt-4 pb-0">
                 <h6 className="fw-bold text-uppercase text-muted">Workstations</h6>
               </div>
               <div className="card-body overflow-auto p-2" style={{ maxHeight: '600px' }}>
                 <div className="list-group list-group-flush">
                   {STAGES.map(s => (
                     <button key={s.id} onClick={() => setSelectedStage(s.id)} className={`list-group-item list-group-item-action border-0 rounded-3 mb-1 d-flex justify-content-between align-items-center ${selectedStage === s.id ? 'active bg-primary text-white shadow-sm' : ''}`}>
                       <span><span className="fw-bold me-2">{s.id}.</span> {s.name}</span>
                     </button>
                   ))}
                 </div>
               </div>
             </div>
          </div>

          <div className="col-12 col-xl-8">
             <div className="card border-0 shadow-sm rounded-4 h-100">
               <div className="card-body p-4">
                 <h4 className="fw-bold mb-1">Stage {stage.id}: {stage.name}</h4>
                 <form onSubmit={handleExecuteRun}>

                   <div className="border rounded-3 p-3 mb-4 bg-light bg-opacity-50 mt-4">
                     <h6 className="fw-bold mb-3 d-flex justify-content-between align-items-center">
                       <span>1. Select Consumed Material</span>
                       <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => fetchWIP(selectedStage)}><i className="fa-solid fa-rotate-right"></i></button>
                     </h6>

                     {loading ? <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary"></div></div> : wipData.length === 0 ? (
                       <div className="alert alert-warning py-2 mb-0 border-0">No WIP waiting at this stage.</div>
                     ) : (
                       <table className="table table-sm table-borderless align-middle mb-0">
                         <thead className="border-bottom text-muted small">
                           <tr><th>Use</th><th>Product</th><th>Batch</th><th>Available</th><th>Consume</th></tr>
                         </thead>
                         <tbody>
                           {wipData.map(wip => {
                             const isChecked = executeForm.selectedWips.hasOwnProperty(wip.id);
                             // Disable checkbox if it's a different product than currently selected
                             const isDisabled = !isChecked && activeWipProductId && activeWipProductId !== wip.product_id;

                             return (
                               <tr key={wip.id} className={isDisabled ? 'opacity-50' : ''}>
                                 <td><input className="form-check-input" type="checkbox" disabled={isDisabled} checked={isChecked} onChange={(e) => handleWipSelection(wip.id, wip.product_id, e.target.checked, wip.current_qty)} /></td>
                                 <td className="small">{wip.product_name || `Product ID ${wip.product_id}`}</td>
                                 <td className="fw-semibold text-primary">{wip.batch_number}</td>
                                 <td>{wip.current_qty} {wip.uom}</td>
                                 <td><input type="number" step="0.001" className="form-control form-control-sm" disabled={!isChecked} value={isChecked ? executeForm.selectedWips[wip.id] : ''} onChange={(e) => handleWipQtyChange(wip.id, e.target.value)} max={wip.current_qty} /></td>
                               </tr>
                             )
                           })}
                         </tbody>
                       </table>
                     )}
                   </div>

                   <div className="row g-3 mb-4">
                     <div className="col-md-6">
                       <label className="form-label fw-bold small text-muted">2. Good Output ({stage.outUOM})</label>
                       <input type="number" step="0.001" className="form-control form-control-lg bg-light border-0" required value={executeForm.good_output_qty} onChange={e => setExecuteForm({...executeForm, good_output_qty: e.target.value})} />
                     </div>
                     <div className="col-md-6">
                       <label className="form-label fw-bold small text-muted">3. Scrap/Waste ({stage.inUOM})</label>
                       <input type="number" step="0.001" className="form-control form-control-lg bg-danger bg-opacity-10 border-0 text-danger" value={executeForm.scrap_qty} onChange={e => setExecuteForm({...executeForm, scrap_qty: e.target.value})} />
                     </div>
                   </div>

                   <button type="submit" disabled={loading || Object.keys(executeForm.selectedWips).length === 0} className="btn btn-primary w-100 py-3 fw-bold rounded-3 shadow-sm">
                     Execute Run & Mutate to Next Stage
                   </button>
                 </form>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* --- 4. WIP MONITOR TAB --- */}
      {activeTab === 'wip' && (
        <div className="card border-0 shadow-sm rounded-4">
           <div className="card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
             <h5 className="fw-bold mb-0">WIP Queue Monitor</h5>
             <select className="form-select w-auto fw-bold text-primary border-primary bg-primary bg-opacity-10" value={selectedStage} onChange={(e) => setSelectedStage(parseInt(e.target.value))}>
               {STAGES.map(s => <option key={s.id} value={s.id}>Stage {s.id}: {s.name}</option>)}
             </select>
           </div>
           <div className="card-body p-0">
             {loading ? <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div> : (
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 py-3">Internal Batch #</th>
                      <th>Product</th>
                      <th>Stage Queued</th>
                      <th>Qty Available</th>
                      <th>UOM</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wipData.length === 0 ? (
                      <tr><td colSpan="6" className="text-center py-4 text-muted">No material waiting at this stage.</td></tr>
                    ) : wipData.map(wip => (
                      <tr key={wip.id}>
                        <td className="px-4 fw-bold text-dark">{wip.batch_number}</td>
                        <td className="text-secondary small">{wip.product_name || `Product ID ${wip.product_id}`}</td>
                        <td>Stage {selectedStage}</td>
                        <td className="fw-semibold">{wip.current_qty}</td>
                        <td className="text-secondary">{wip.uom}</td>
                        <td><span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1">AVAILABLE</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             )}
           </div>
        </div>
      )}

      {/* --- 5. LEDGER TAB WITH UNDO BUTTON --- */}
      {activeTab === 'ledger' && (
        <div className="card border-0 shadow-sm rounded-4">
          <div className="card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
            <h5 className="fw-bold mb-0">Factory Movement Truth</h5>
            <input type="text" className="form-control w-auto bg-light" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          <div className="card-body p-0 overflow-auto" style={{ maxHeight: '70vh' }}>
            {ledgerLoading ? <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div> : (
              <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.9rem' }}>
                <thead className="table-light sticky-top">
                  <tr>
                    <th className="px-4 text-muted">Date</th>
                    <th className="text-muted">Product / Stage</th>
                    <th className="text-muted">Batch #</th>
                    <th className="text-muted">Transaction Type</th>
                    <th className="text-center text-muted">Qty Change</th>
                    <th className="text-center text-muted">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.map((row) => {
                    const isRunTx = row.reference_document?.startsWith('RUN-');
                    const runId = isRunTx ? row.reference_document.split('-')[1] : null;
                    const canUndo = isRunTx && (row.transaction_type === 'WIP_PRODUCED' || row.transaction_type === 'FG_PRODUCED');

                    return (
                    <tr key={row.id}>
                      <td className="px-4 text-secondary small fw-medium">{row.date}</td>
                      <td>
                        <div className="fw-bold text-dark">{row.product_name}</div>
                        <div className="text-muted small">{row.sku}</div>
                      </td>
                      <td><span className="badge bg-light text-dark border">{row.batch_number}</span></td>
                      <td className="fw-semibold text-secondary" style={{ fontSize: '0.8rem' }}>{row.transaction_type.replace(/_/g, ' ')}</td>
                      <td className="text-center fw-bold fs-6">{getQtyBadge(row.quantity_change, row.transaction_type)}</td>
                      <td className="text-center">
                         {canUndo && (
                           <button onClick={() => handleReverseRun(runId)} className="btn btn-sm btn-outline-danger py-0 px-2" title="Reverse this Run">
                             <i className="fa-solid fa-rotate-left"></i> Undo
                           </button>
                         )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

    </div>
  );
}