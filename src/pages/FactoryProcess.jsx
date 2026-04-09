import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function FactoryProcess() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('execute');
    const [loading, setLoading] = useState(true);

    // --- MASTER DATA ---
    const [stages, setStages] = useState([]);
    const [products, setProducts] = useState([]);
    const [scrapReasons, setScrapReasons] = useState([]);
    const [boms, setBoms] = useState([]); // NEW: Store standard recipes
    const [selectedStageId, setSelectedStageId] = useState(null);

    const rmProducts = products.filter(p => p.item_type === 'RM');

    // --- TRANSACTIONAL DATA ---
    const [wipData, setWipData] = useState([]);
    const [ledgerData, setLedgerData] = useState([]);

    // --- FORMS ---
    const [intakeForm, setIntakeForm] = useState({
        product_id: '', vendor_lot_number: '', invoice_qty: ''
    });

    const [executeForm, setExecuteForm] = useState({
        good_output_qty: '',
        selectedWips: {},
        consumed_materials: [],
        scrap_details: []
    });

    const activeWipProductId = wipData.find(w => executeForm.selectedWips[w.id])?.product_id || null;

    // --- INITIALIZATION ---
    useEffect(() => {
        const loadMasterData = async () => {
            try {
                // NEW: Fetch BOMs alongside everything else
                const [prodRes, stagesRes, scrapRes, bomsRes] = await Promise.all([
                    api.get('/products/'),
                    api.get('/production/stages'),
                    api.get('/production/scrap-reasons').catch(() => ({ data: [] })),
                    api.get('/production/boms').catch(() => ({ data: [] }))
                ]);

                setProducts(prodRes.data || []);
                const sortedStages = (stagesRes.data || []).sort((a, b) => a.sequence_number - b.sequence_number);
                setStages(sortedStages);
                if (sortedStages.length > 0) setSelectedStageId(sortedStages[0].id);

                setScrapReasons(scrapRes.data || []);
                setBoms(bomsRes.data || []);

            } catch (err) {
                toast.error("Failed to load factory master data.");
            } finally {
                setLoading(false);
            }
        };
        loadMasterData();
    }, []);

    useEffect(() => {
        if (selectedStageId && (activeTab === 'wip' || activeTab === 'execute')) fetchWIP(selectedStageId);
        if (activeTab === 'ledger') fetchLedger();
    }, [activeTab, selectedStageId]);

    // --- API CALLS ---
    const fetchWIP = async (stageId) => {
        try {
            const res = await api.get(`/production/wip/available/${stageId}`);
            setWipData(res.data || []);
            setExecuteForm(prev => ({ ...prev, selectedWips: {}, good_output_qty: '', consumed_materials: [], scrap_details: [] }));
        } catch { setWipData([]); }
    };

    const fetchLedger = async () => {
        try {
            const res = await api.get(`/production/ledger/1`);
            setLedgerData(res.data || []);
        } catch { setLedgerData([]); }
    };

    // --- SMART RECIPE AUTO-FILL LOGIC ---
    const handleAutoFillRecipe = () => {
        if (!executeForm.good_output_qty) {
            return toast.error("Please enter your Target Good Output first so we can scale the recipe.");
        }
        if (!activeWipProductId) {
            return toast.error("Please select your input WIP batch first.");
        }

        // Find the recipe for this stage that uses the currently selected WIP as a base ingredient
        const applicableBom = boms.find(b =>
            b.stage_id === selectedStageId &&
            b.items.some(i => i.input_product_id === activeWipProductId)
        );

        if (!applicableBom) {
            return toast.error("No standard recipe found matching this stage and input material.");
        }

        // Math: Scale the recipe based on how much output the operator wants to make
        const multiplier = parseFloat(executeForm.good_output_qty) / applicableBom.base_qty;

        // Filter out the main WIP (since it's checked in Step 1) and map the raw materials
        const standardMaterials = applicableBom.items
            .filter(i => i.input_product_id !== activeWipProductId)
            .map(i => ({
                product_id: i.input_product_id,
                batch_number: `BOM-AUTO-${Date.now().toString().slice(-5)}`,
                qty_to_consume: (i.expected_qty * multiplier).toFixed(2) // Scale mathematically
            }));

        setExecuteForm(prev => ({
            ...prev,
            consumed_materials: standardMaterials
        }));

        toast.success("Standard recipe loaded! You can tweak the quantities if actual usage differed.");
    };

    // --- DYNAMIC FORM HANDLERS ---
    const addRM = () => setExecuteForm(p => ({ ...p, consumed_materials: [...p.consumed_materials, { product_id: '', batch_number: '', qty_to_consume: '' }] }));
    const updateRM = (idx, field, val) => {
        const newRMs = [...executeForm.consumed_materials];
        newRMs[idx][field] = val;
        setExecuteForm(p => ({ ...p, consumed_materials: newRMs }));
    };
    const removeRM = (idx) => {
        const newRMs = [...executeForm.consumed_materials];
        newRMs.splice(idx, 1);
        setExecuteForm(p => ({ ...p, consumed_materials: newRMs }));
    };

    const addScrap = () => setExecuteForm(p => ({ ...p, scrap_details: [...p.scrap_details, { reason_id: '', product_id: '', qty: '' }] }));
    const updateScrap = (idx, field, val) => {
        const newScraps = [...executeForm.scrap_details];
        newScraps[idx][field] = val;
        setExecuteForm(p => ({ ...p, scrap_details: newScraps }));
    };
    const removeScrap = (idx) => {
        const newScraps = [...executeForm.scrap_details];
        newScraps.splice(idx, 1);
        setExecuteForm(p => ({ ...p, scrap_details: newScraps }));
    };

    // --- SUBMISSIONS ---
    const handleIntakeSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/production/intake-raw-material', {
                factory_id: 1,
                ...intakeForm,
                invoice_qty: parseFloat(intakeForm.invoice_qty),
                operator_id: user?.id || 1,
                batch_number: intakeForm.vendor_lot_number || `RM-INTAKE-${Date.now()}`
            });
            toast.success('Raw Material Received & Stored!');
            setIntakeForm({ product_id: '', vendor_lot_number: '', invoice_qty: '' });
        } catch (err) { toast.error('Intake failed.'); }
    };

    const handleExecuteRun = async (e) => {
        e.preventDefault();
        const consumed_wips = Object.keys(executeForm.selectedWips).map(id => ({
            wip_id: parseInt(id),
            qty_to_consume: parseFloat(executeForm.selectedWips[id])
        }));

        if (!consumed_wips.length) return toast.error('Please select WIP blades to process.');

        const toastId = toast.loading('Executing Production Run & Calculating Costs...');

        try {
            await api.post('/production/execute-run', {
                idempotency_key: crypto.randomUUID(),
                stage_id: selectedStageId,
                factory_id: 1,
                operator_id: user?.id || 1,
                product_id: activeWipProductId || 1,
                consumed_wips: consumed_wips,
                good_output_qty: parseFloat(executeForm.good_output_qty) || 0,
                consumed_materials: executeForm.consumed_materials
                    .filter(rm => rm.product_id && rm.qty_to_consume)
                    .map(rm => ({
                        product_id: parseInt(rm.product_id),
                        qty_to_consume: parseFloat(rm.qty_to_consume),
                        batch_number: rm.batch_number || `AUTO-RM-${Date.now()}`
                    })),
                scrap_details: executeForm.scrap_details
                    .filter(s => s.reason_id && s.qty)
                    .map(s => ({
                        reason_id: parseInt(s.reason_id),
                        product_id: parseInt(s.product_id),
                        qty: parseFloat(s.qty)
                    }))
            });

            toast.success(`Run Executed Successfully! Costs Updated.`, { id: toastId });
            setExecuteForm({ good_output_qty: '', selectedWips: {}, consumed_materials: [], scrap_details: [] });
            fetchWIP(selectedStageId);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Execution failed.', { id: toastId });
        }
    };

    const handleReverseRun = async (runId) => {
        if (!window.confirm(`WARNING: Reverse Run ${runId}? This will delete the output and restore materials.`)) return;
        try {
            await api.post(`/production/reverse-run/${runId}`);
            toast.success('Run Reversed Successfully.');
            fetchLedger();
        } catch (err) { toast.error('Reversal failed.'); }
    };

    if (loading) return (
        <div className="d-flex justify-content-center align-items-center vh-100">
            <div className="spinner-border text-primary" role="status"></div>
        </div>
    );

    return (
        <div className="container-fluid p-4 bg-light min-vh-100">
            <Toaster position="top-right" />
            <h3 className="mb-4 fw-bold text-dark">Factory Floor Engine</h3>

            <div className="mb-4 pb-2 border-bottom">
                <button className={`btn fw-bold me-2 rounded-pill ${activeTab === 'intake' ? 'btn-success shadow-sm' : 'btn-outline-success border-0'}`} onClick={() => setActiveTab('intake')}>1. Receive Material</button>
                <button className={`btn fw-bold me-2 rounded-pill ${activeTab === 'execute' ? 'btn-primary shadow-sm' : 'btn-outline-primary border-0'}`} onClick={() => setActiveTab('execute')}>2. Execute Process</button>
                <button className={`btn fw-bold me-2 rounded-pill ${activeTab === 'wip' ? 'btn-dark shadow-sm' : 'btn-outline-dark border-0'}`} onClick={() => setActiveTab('wip')}>Floor Buffer (WIP)</button>
                <button className={`btn fw-bold me-2 rounded-pill ${activeTab === 'ledger' ? 'btn-secondary shadow-sm' : 'btn-outline-secondary border-0'}`} onClick={() => setActiveTab('ledger')}>Audit Ledger</button>
            </div>

            {/* TAB 1: INTAKE RM */}
            {activeTab === 'intake' && (
                <div className="card p-4 col-md-6 shadow-sm border-0 rounded-4">
                    <h5 className="mb-3 text-success fw-bold">Receive Raw Material from Vendor</h5>
                    <form onSubmit={handleIntakeSubmit}>
                        <label className="text-muted small fw-bold">Select Material</label>
                        <select className="form-select mb-3 bg-light" required value={intakeForm.product_id} onChange={e => setIntakeForm({ ...intakeForm, product_id: e.target.value })}>
                            <option value="">-- Choose Raw Material --</option>
                            {rmProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <label className="text-muted small fw-bold">Vendor Lot / Invoice Number</label>
                        <input className="form-control mb-3 bg-light" placeholder="e.g. JINDAL-COIL-01" required value={intakeForm.vendor_lot_number} onChange={e => setIntakeForm({ ...intakeForm, vendor_lot_number: e.target.value })} />
                        <label className="text-muted small fw-bold">Quantity Received</label>
                        <input className="form-control mb-4 bg-light" type="number" step="0.01" placeholder="0.00" required value={intakeForm.invoice_qty} onChange={e => setIntakeForm({ ...intakeForm, invoice_qty: e.target.value })} />
                        <button className="btn btn-success w-100 py-2 fw-bold rounded-3">Store in Warehouse</button>
                    </form>
                </div>
            )}

            {/* TAB 2: EXECUTE RUN */}
            {activeTab === 'execute' && (
                <div className="row g-4">
                    <div className="col-12 col-md-3">
                        <div className="card shadow-sm border-0 rounded-4 h-100">
                            <div className="card-header bg-dark text-white rounded-top-4 py-3">
                                <h6 className="m-0 fw-bold">Factory Stages</h6>
                            </div>
                            <div className="list-group list-group-flush rounded-bottom-4">
                                {stages.map(s => (
                                    <button key={s.id} onClick={() => setSelectedStageId(s.id)} className={`list-group-item list-group-item-action py-3 ${selectedStageId === s.id ? 'active bg-primary fw-bold' : ''}`}>
                                        {s.sequence_number}. {s.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="col-12 col-md-9">
                        <div className="card p-4 shadow-sm border-0 rounded-4">
                            <h4 className="mb-4 border-bottom pb-3 fw-bold">
                                Running: {stages.find(s => s.id === selectedStageId)?.name || 'Stage'}
                            </h4>

                            <form onSubmit={handleExecuteRun}>

                                {/* --- STEP 1: SELECT WIP --- */}
                                <h6 className="fw-bold text-primary mb-3">Step 1: Select Input Batch (WIP)</h6>
                                <div className="table-responsive mb-4 bg-light p-2 rounded-3 border">
                                    <table className="table table-sm align-middle mb-0 bg-white">
                                        <thead className="table-light">
                                            <tr>
                                                <th width="5%"></th>
                                                <th>Item</th>
                                                <th>Batch #</th>
                                                <th width="25%">Qty to Consume</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {wipData.length === 0 ? (
                                                <tr><td colSpan="4" className="text-center py-3 text-muted">No materials waiting at this stage.</td></tr>
                                            ) : (
                                                wipData.map(w => (
                                                    <tr key={w.id}>
                                                        <td>
                                                            <input className="form-check-input ms-2" type="checkbox" checked={!!executeForm.selectedWips[w.id]} onChange={(e) => setExecuteForm(p => {
                                                                const wips = { ...p.selectedWips };
                                                                if (e.target.checked) wips[w.id] = w.current_qty;
                                                                else delete wips[w.id];
                                                                return { ...p, selectedWips: wips };
                                                            })} />
                                                        </td>
                                                        <td className="fw-semibold small">{w.product_name}</td>
                                                        <td><code className="bg-light px-2 py-1 rounded">{w.batch_number}</code></td>
                                                        <td>
                                                            <input type="number" step="0.01" className="form-control form-control-sm border-primary" disabled={!executeForm.selectedWips[w.id]} value={executeForm.selectedWips[w.id] || ''} onChange={e => setExecuteForm(p => ({ ...p, selectedWips: { ...p.selectedWips, [w.id]: parseFloat(e.target.value) } }))} />
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* --- REARRANGED: STEP 2 (TARGET OUTPUT) --- */}
                                <h6 className="fw-bold text-success mt-4">Step 2: Target Good Output</h6>
                                <div className="p-3 bg-success bg-opacity-10 border border-success border-opacity-25 rounded-3 mb-4">
                                    <label className="form-label fw-bold text-success mb-1">Total Good Quantity You Plan to Make</label>
                                    <input type="number" step="0.01" className="form-control form-control-lg bg-white fw-bold text-success border-success" required value={executeForm.good_output_qty} onChange={e => setExecuteForm({ ...executeForm, good_output_qty: e.target.value })} placeholder="0.00" />
                                </div>

                                {/* --- STEP 3: INJECT RAW MATERIALS (WITH MAGIC BUTTON) --- */}
                                <div className="d-flex justify-content-between align-items-center mb-3 mt-4 border-top pt-4">
                                    <div>
                                        <h6 className="fw-bold text-warning mb-0">Step 3: Consumables (Recipe)</h6>
                                        <small className="text-muted">Review, tweak, or add extra materials used.</small>
                                    </div>
                                    <div>
                                        <button type="button" className="btn btn-sm btn-dark fw-bold rounded-pill px-3 me-2" onClick={handleAutoFillRecipe}>
                                            <i className="fa-solid fa-wand-magic-sparkles me-1"></i> Auto-Fill Expected Recipe
                                        </button>
                                        <button type="button" className="btn btn-sm btn-outline-warning fw-bold rounded-pill px-3" onClick={addRM}>+ Add Extra</button>
                                    </div>
                                </div>

                                {executeForm.consumed_materials.map((rm, idx) => (
                                    <div key={idx} className="d-flex gap-2 mb-2 bg-light p-2 rounded border">
                                        <select className="form-select form-select-sm w-50 fw-bold" value={rm.product_id} onChange={(e) => updateRM(idx, 'product_id', e.target.value)}>
                                            <option value="">-- Select Consumable --</option>
                                            {rmProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        <input type="text" className="form-control form-control-sm w-25 font-monospace" placeholder="Batch/Roll #" value={rm.batch_number} onChange={(e) => updateRM(idx, 'batch_number', e.target.value)} />
                                        <input type="number" step="0.01" className="form-control form-control-sm w-25 text-primary fw-bold" placeholder="Qty" value={rm.qty_to_consume} onChange={(e) => updateRM(idx, 'qty_to_consume', e.target.value)} />
                                        <button type="button" className="btn btn-sm btn-danger px-2" onClick={() => removeRM(idx)}>X</button>
                                    </div>
                                ))}

                                {/* --- STEP 4: LOG SCRAP --- */}
                                <div className="d-flex justify-content-between align-items-center mb-3 mt-4 border-top pt-4">
                                    <div>
                                        <h6 className="fw-bold text-danger mb-0">Step 4: Log Defects & Scrap (Optional)</h6>
                                        <small className="text-muted">Recording waste helps accurately track yield rates.</small>
                                    </div>
                                    <button type="button" className="btn btn-sm btn-outline-danger fw-bold rounded-pill px-3" onClick={addScrap}>+ Log Scrap</button>
                                </div>

                                {executeForm.scrap_details.map((scrap, idx) => (
                                    <div key={idx} className="d-flex gap-2 mb-2 bg-danger bg-opacity-10 p-2 rounded border border-danger border-opacity-25">
                                        <select className="form-select form-select-sm w-50" value={scrap.reason_id} onChange={(e) => updateScrap(idx, 'reason_id', e.target.value)}>
                                            <option value="">-- Defect Reason --</option>
                                            {scrapReasons.map(r => <option key={r.id} value={r.id}>{r.description || r.code}</option>)}
                                        </select>
                                        <select className="form-select form-select-sm w-25" value={scrap.product_id} onChange={(e) => updateScrap(idx, 'product_id', e.target.value)}>
                                            <option value="">-- Scrapped Item --</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        <input type="number" step="0.01" className="form-control form-control-sm w-25 text-danger fw-bold" placeholder="Qty" value={scrap.qty} onChange={(e) => updateScrap(idx, 'qty', e.target.value)} />
                                        <button type="button" className="btn btn-sm btn-outline-danger px-2 bg-white" onClick={() => removeScrap(idx)}>X</button>
                                    </div>
                                ))}

                                <button type="submit" className="btn btn-primary btn-lg w-100 py-3 mt-4 fw-bolder rounded-pill shadow">
                                    EXECUTE BATCH & CALCULATE COST
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: WIP MONITOR */}
            {activeTab === 'wip' && (
                <div className="card p-4 shadow-sm border-0 rounded-4">
                    <h5 className="fw-bold mb-4 border-bottom pb-2">Factory Buffer Monitor</h5>
                    <div className="row mb-3">
                        <div className="col-md-4">
                            <label className="text-muted small fw-bold">Filter by Stage</label>
                            <select className="form-select bg-light fw-bold" value={selectedStageId} onChange={e => setSelectedStageId(parseInt(e.target.value))}>
                                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="table-responsive">
                        <table className="table table-hover align-middle">
                            <thead className="table-light"><tr><th>Batch ID</th><th>Product</th><th className="text-end">Qty Available</th></tr></thead>
                            <tbody>
                                {wipData.length === 0 ? <tr><td colSpan="3" className="text-center py-4 text-muted">Clear floor. No inventory here.</td></tr> : null}
                                {wipData.map(w => (
                                    <tr key={w.id}>
                                        <td><code className="text-dark bg-light px-2 py-1 rounded border">{w.batch_number}</code></td>
                                        <td className="fw-semibold">{w.product_name}</td>
                                        <td className="text-end fw-bold text-primary">{w.current_qty}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 4: LEDGER */}
            {activeTab === 'ledger' && (
                <div className="card p-4 shadow-sm border-0 rounded-4">
                    <h5 className="fw-bold mb-4 border-bottom pb-2">Process Audit Ledger</h5>
                    <div className="table-responsive custom-scrollbar" style={{ maxHeight: '65vh' }}>
                        <table className="table table-sm table-hover align-middle">
                            <thead className="table-dark sticky-top">
                                <tr><th>Event Type</th><th>Product</th><th>Batch</th><th className="text-center">Delta</th><th className="text-end pe-3">Action</th></tr>
                            </thead>
                            <tbody>
                                {ledgerData.map(tx => (
                                    <tr key={tx.id}>
                                        <td><span className="badge bg-secondary">{tx.transaction_type}</span></td>
                                        <td className="fw-semibold small">{tx.product_name}</td>
                                        <td><code className="text-muted">{tx.batch_number}</code></td>
                                        <td className={`text-center fw-bold ${tx.quantity_change > 0 ? 'text-success' : 'text-danger'}`}>
                                            {tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}
                                        </td>
                                        <td className="text-end pe-3">
                                            {tx.reference_document?.startsWith('RUN-') && (
                                                <button className="btn btn-sm btn-outline-danger rounded-pill fw-bold" onClick={() => handleReverseRun(tx.reference_document.split('-')[1])}>
                                                    Undo Run
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}