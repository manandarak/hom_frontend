import React, {useState, useEffect, useMemo} from 'react';
import api from '../api';
import toast, {Toaster} from 'react-hot-toast';
import {useAuth} from '../context/AuthContext';

// --- CONSTANTS: The 16 Stages of Razor Blade Manufacturing ---
const STAGES = [
    {id: 1, name: 'Punching', inUOM: 'KG', outUOM: 'KG'},
    {id: 2, name: 'Hardening / Furnace', inUOM: 'KG', outUOM: 'KG'},
    {id: 3, name: 'Coil Joining', inUOM: 'KG', outUOM: 'KG'},
    {id: 4, name: 'Passivation', inUOM: 'KG', outUOM: 'KG'},
    {id: 5, name: 'Printing', inUOM: 'KG', outUOM: 'KG'},
    {id: 6, name: 'Grinder / Stropper', inUOM: 'KG', outUOM: 'NOS', isConversion: true},
    {id: 7, name: 'Heat Cleaning', inUOM: 'NOS', outUOM: 'NOS'},
    {id: 8, name: 'Sputtering', inUOM: 'NOS', outUOM: 'NOS'},
    {id: 9, name: 'Spray Unit', inUOM: 'NOS', outUOM: 'NOS'},
    {id: 10, name: 'Sintering', inUOM: 'NOS', outUOM: 'NOS'},
    {id: 11, name: 'Oil Bath', inUOM: 'NOS', outUOM: 'NOS'},
    {id: 12, name: 'Wrapping', inUOM: 'NOS', outUOM: 'TUCKS', isConversion: true},
    {id: 13, name: 'Pocketing', inUOM: 'TUCKS', outUOM: 'TUCKS'},
    {id: 14, name: 'Cellophaning', inUOM: 'TUCKS', outUOM: 'TUCKS'},
    {id: 15, name: 'Shrink wrapping / packing', inUOM: 'TUCKS', outUOM: 'BOXES', isConversion: true},
    {id: 16, name: 'Store / Final FG Intake', inUOM: 'BOXES', outUOM: 'BOXES', isFinal: true}
];

export default function FactoryProcess() {
    const {user} = useAuth();
    const [activeTab, setActiveTab] = useState('execute');
    const [selectedStage, setSelectedStage] = useState(1);
    const [loading, setLoading] = useState(false);

    // --- MASTER DATA ---
    const [products, setProducts] = useState([]);
    const [scrapReasons, setScrapReasons] = useState([]);
    const rmProducts = products.filter(p => p.item_type === 'RM');

    // --- WIP & LEDGER STATE ---
    const [wipData, setWipData] = useState([]);
    const [ledgerData, setLedgerData] = useState([]);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // --- FORMS ---
    const [intakeForm, setIntakeForm] = useState({
        factory_id: 1,
        product_id: '',
        vendor_lot_number: '',
        invoice_qty: '',
        uom: 'KG',
        batch_number: ''
    });

    const [executeForm, setExecuteForm] = useState({
        good_output_qty: '',
        selectedWips: {},
        consumed_materials: [], // Array of { product_id, batch_number, qty_to_consume }
        scrap_details: []       // Array of { reason_id, product_id, qty }
    });

    // Process Options for the MES
    const [processOptions, setProcessOptions] = useState({
        shift: 'Morning (06:00 - 14:00)',
        machine_id: 'Line A',
        notes: '',
        qc_passed: false
    });

    const activeWipProductId = wipData.find(w => executeForm.selectedWips[w.id])?.product_id || null;
    const totalInputQty = Object.values(executeForm.selectedWips).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    // --- HEAVY ANALYTICS COMPUTATION ---
    const reportStats = useMemo(() => {
        let rmIntake = 0, scrap = 0, fg = 0, wipProd = 0;
        let stageActivity = {};

        ledgerData.forEach(tx => {
            const qty = Math.abs(parseFloat(tx.quantity_change) || 0);

            if (tx.transaction_type === 'RM_INTAKE') rmIntake += qty;
            if (tx.transaction_type === 'SCRAP_PRODUCED') scrap += qty;
            if (tx.transaction_type === 'FG_PRODUCED') fg += qty;
            if (tx.transaction_type === 'WIP_PRODUCED') wipProd += qty;

            // Stage-by-stage aggregation
            if (tx.stage_id) {
                if (!stageActivity[tx.stage_id]) stageActivity[tx.stage_id] = {out: 0, scrap: 0};
                if (tx.transaction_type.includes('PRODUCED')) stageActivity[tx.stage_id].out += qty;
                if (tx.transaction_type === 'SCRAP_PRODUCED') stageActivity[tx.stage_id].scrap += qty;
            }
        });

        const totalProcessed = wipProd + fg;
        const yieldPercent = totalProcessed > 0 ? ((totalProcessed / (totalProcessed + scrap)) * 100).toFixed(1) : 0;

        let maxStageVolume = 0;
        Object.values(stageActivity).forEach(stat => {
            const totalVolume = stat.out + stat.scrap;
            if (totalVolume > maxStageVolume) maxStageVolume = totalVolume;
        });

        return {rmIntake, scrap, fg, yieldPercent, stageActivity, maxStageVolume};
    }, [ledgerData]);

    // --- EFFECTS ---
    useEffect(() => {
        const activeWip = wipData.find(w => executeForm.selectedWips[w.id]);

        if (activeWip && totalInputQty > 0) {
            let autoOutput = '';
            if (selectedStage === 12) {
                const bladesPerTuck = activeWip.blades_per_tuck || 5;
                autoOutput = (totalInputQty / bladesPerTuck).toFixed(2);
            } else if (selectedStage === 15) {
                const tucksPerBox = activeWip.tucks_per_box || 2000;
                autoOutput = (totalInputQty / tucksPerBox).toFixed(2);
            }

            if (autoOutput !== '') {
                setExecuteForm(prev => ({...prev, good_output_qty: autoOutput}));
            }
        }
    }, [totalInputQty, selectedStage, wipData, executeForm.selectedWips]);

    useEffect(() => {
        fetchProducts();
        fetchScrapReasons();
    }, []);

    useEffect(() => {
        if (activeTab === 'wip' || activeTab === 'execute') fetchWIP(selectedStage);
        if (activeTab === 'ledger' || activeTab === 'reports') fetchLedger();
    }, [activeTab, selectedStage]);

    // --- API CALLS ---
    const fetchProducts = async () => {
        try {
            const response = await api.get('/products/');
            setProducts(response.data || []);
        } catch (error) {
            toast.error("Failed to load product master data.");
        }
    };

    const fetchScrapReasons = async () => {
        try {
            // Adjust this endpoint path based on your exact FastAPI routing
            const response = await api.get('/production/scrap-reasons');
            setScrapReasons(response.data || []);
        } catch (error) {
            // Fallback for UI if endpoint not ready yet
            setScrapReasons([
                { id: 1, code: 'ERR-JAM', description: 'Machine Jam / Crushed Units', is_recoverable: false },
                { id: 2, code: 'ERR-MAT', description: 'Defective Raw Material', is_recoverable: false },
                { id: 3, code: 'ERR-PRINT', description: 'Smudged or Bad Printing', is_recoverable: true }
            ]);
        }
    };

    const fetchWIP = async (stageId) => {
        setLoading(true);
        try {
            const response = await api.get(`/production/wip/available/${stageId}`);
            setWipData(response.data || []);
            setExecuteForm(prev => ({...prev, selectedWips: {}, consumed_materials: [], scrap_details: []}));
            setProcessOptions(prev => ({...prev, qc_passed: false}));
        } catch (error) {
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
                sku: item.sku ? `SKU: ${item.sku} | Stage: ${item.stage_id || 'N/A'}` : `Stage: ${item.stage_id || 'N/A'}`
            }));
            setLedgerData(formattedData);
        } catch (error) {
            toast.error('Failed to load ledger data.');
            setLedgerData([]);
        } finally {
            setLedgerLoading(false);
        }
    };

    // --- HANDLERS ---
    const handleIntakeProductChange = (e) => {
        const pid = parseInt(e.target.value);
        const prod = rmProducts.find(p => p.id === pid);
        setIntakeForm({...intakeForm, product_id: pid, uom: prod ? prod.uom : 'KG'});
    };

    const handleIntakeSubmit = async (e) => {
        e.preventDefault();
        if (!intakeForm.product_id) return toast.error('Please select a Raw Material.');

        const toastId = toast.loading('Logging Raw Material...');
        try {
            await api.post('/production/intake-raw-material', {
                ...intakeForm,
                invoice_qty: parseFloat(intakeForm.invoice_qty),
                operator_id: user?.id || 1,
                batch_number: intakeForm.vendor_lot_number || `RM-INTAKE-${Date.now()}`
            });
            toast.success('Material received! Ready for Stage 1.', {id: toastId});
            setIntakeForm({
                factory_id: 1,
                product_id: '',
                vendor_lot_number: '',
                invoice_qty: '',
                uom: 'KG',
                batch_number: ''
            });

            setSelectedStage(1);
            setActiveTab('execute');
        } catch (error) {
            toast.error('Failed to issue material.', {id: toastId});
        }
    };

    const handleWipSelection = (wipId, wipProductId, checked, maxQty) => {
        if (checked && activeWipProductId && activeWipProductId !== wipProductId) {
            return toast.error('Cannot mix different materials/products in a single run.');
        }
        setExecuteForm(prev => {
            const updated = {...prev.selectedWips};
            if (checked) updated[wipId] = maxQty;
            else delete updated[wipId];
            return {...prev, selectedWips: updated};
        });
    };

    const handleWipQtyChange = (wipId, val) => {
        setExecuteForm(prev => ({
            ...prev,
            selectedWips: {...prev.selectedWips, [wipId]: parseFloat(val) || 0}
        }));
    };

    // --- DYNAMIC FORM HANDLERS FOR NEW SCHEMA ---
    const addRM = () => setExecuteForm(p => ({ ...p, consumed_materials: [...p.consumed_materials, { product_id: '', batch_number: '', qty_to_consume: '' }] }));
    const updateRM = (index, field, val) => {
        const newRMs = [...executeForm.consumed_materials];
        newRMs[index][field] = val;
        setExecuteForm(p => ({ ...p, consumed_materials: newRMs }));
    };
    const removeRM = (index) => {
        const newRMs = [...executeForm.consumed_materials];
        newRMs.splice(index, 1);
        setExecuteForm(p => ({ ...p, consumed_materials: newRMs }));
    };

    const addScrap = () => setExecuteForm(p => ({ ...p, scrap_details: [...p.scrap_details, { reason_id: '', product_id: '', qty: '' }] }));
    const updateScrap = (index, field, val) => {
        const newScraps = [...executeForm.scrap_details];
        newScraps[index][field] = val;
        setExecuteForm(p => ({ ...p, scrap_details: newScraps }));
    };
    const removeScrap = (index) => {
        const newScraps = [...executeForm.scrap_details];
        newScraps.splice(index, 1);
        setExecuteForm(p => ({ ...p, scrap_details: newScraps }));
    };

    const handleExecuteRun = async (e) => {
        e.preventDefault();
        if (!processOptions.qc_passed) {
            return toast.error('You must confirm Quality Control checks before executing.');
        }

        const consumed_wips = Object.keys(executeForm.selectedWips).map(id => ({
            wip_id: parseInt(id),
            qty_to_consume: executeForm.selectedWips[id]
        }));

        if (consumed_wips.length === 0) return toast.error('Select at least one WIP batch to feed the machine.');

        const toastId = toast.loading(`Executing Stage ${selectedStage}...`);

        const payload = {
            idempotency_key: crypto.randomUUID(),
            stage_id: selectedStage,
            factory_id: 1,
            operator_id: user?.id || 1,
            product_id: activeWipProductId || 1,
            consumed_wips: consumed_wips,
            good_output_qty: parseFloat(executeForm.good_output_qty) || 0,

            consumed_materials: executeForm.consumed_materials
                .filter(rm => rm.product_id && rm.qty_to_consume)
                .map(rm => ({
                    product_id: parseInt(rm.product_id),
                    batch_number: rm.batch_number || `RM-AUTO-${Date.now()}`,
                    qty_to_consume: parseFloat(rm.qty_to_consume)
                })),

            scrap_details: executeForm.scrap_details
                .filter(s => s.reason_id && s.product_id && s.qty)
                .map(s => ({
                    reason_id: parseInt(s.reason_id),
                    product_id: parseInt(s.product_id),
                    qty: parseFloat(s.qty)
                }))
        };

        try {
            await api.post('/production/execute-run', payload);
            toast.success(`Stage ${selectedStage} executed successfully!`, {id: toastId});

            setExecuteForm({good_output_qty: '', consumed_materials: [], scrap_details: [], selectedWips: {}});
            setProcessOptions({...processOptions, notes: '', qc_passed: false});
            fetchWIP(selectedStage);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Execution failed.', {id: toastId});
        }
    };

    const handleReverseRun = async (runId) => {
        if (!window.confirm(`DANGER: Reverse Run ${runId}? This restores consumed WIP and deletes the output.`)) return;

        const toastId = toast.loading('Reversing run...');
        try {
            await api.post(`/production/reverse-run/${runId}`);
            toast.success(`Run ${runId} reversed.`, {id: toastId});
            fetchLedger();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to reverse.', {id: toastId});
        }
    };

    // --- RENDER HELPERS ---
    const stage = STAGES.find(s => s.id === selectedStage) || STAGES[0];
    const filteredLedger = ledgerData.filter(item =>
        item.batch_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.reference_document?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getQtyBadge = (qty, type) => {
        if (type?.includes('SCRAP')) return <span className="badge bg-danger text-white px-2 py-1"><i
            className="fa-solid fa-trash-can me-1"></i> {qty}</span>;
        if (qty > 0) return <span
            className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1">+{qty}</span>;
        if (qty < 0) return <span
            className="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 px-2 py-1">{qty}</span>;
        return <span className="badge bg-secondary">{qty}</span>;
    };

    return (
        <div className="p-4 bg-light min-vh-100">
            <Toaster position="top-right"/>

            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="fw-bolder text-dark mb-0"><i
                        className="fa-solid fa-industry text-primary me-2"></i> Factory Floor Execution</h2>
                    <p className="text-muted small mt-1">End-to-End Traceability, Routing, & MES Controls</p>
                </div>
            </div>

            {/* TABS */}
            <div className="overflow-auto pb-2 mb-4 custom-scrollbar">
                <ul className="nav nav-pills bg-white p-2 rounded-pill shadow-sm border flex-nowrap"
                    style={{width: 'fit-content'}}>
                    <li className="nav-item">
                        <button
                            className={`nav-link rounded-pill px-3 text-nowrap ${activeTab === 'flowchart' ? 'active shadow-sm' : 'text-secondary'}`}
                            onClick={() => setActiveTab('flowchart')}>
                            <i className="fa-solid fa-diagram-project me-2"></i> Process Map
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link rounded-pill px-3 fw-bold text-nowrap ${activeTab === 'intake' ? 'active bg-success shadow-sm text-white' : 'text-success'}`}
                            onClick={() => setActiveTab('intake')}>
                            <i className="fa-solid fa-pallet me-2"></i> 1. Issue RM
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link rounded-pill px-3 fw-bold text-nowrap ${activeTab === 'execute' ? 'active shadow-sm' : 'text-secondary'}`}
                            onClick={() => setActiveTab('execute')}>
                            <i className="fa-solid fa-gears me-2"></i> 2. Execute Runs
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link rounded-pill px-3 text-nowrap ${activeTab === 'wip' ? 'active shadow-sm' : 'text-secondary'}`}
                            onClick={() => setActiveTab('wip')}>
                            <i className="fa-solid fa-layer-group me-2"></i> Floor WIP
                        </button>
                    </li>
                    <li className="nav-item">
                        <button
                            className={`nav-link rounded-pill px-3 text-nowrap ${activeTab === 'ledger' ? 'active shadow-sm bg-dark text-white' : 'text-secondary'}`}
                            onClick={() => setActiveTab('ledger')}>
                            <i className="fa-solid fa-list-check me-2"></i> Audit Ledger
                        </button>
                    </li>
                    <li className="nav-item ms-2 border-start ps-2">
                        <button
                            className={`nav-link rounded-pill px-3 fw-bold text-nowrap ${activeTab === 'reports' ? 'active shadow-sm bg-info text-white' : 'text-info'}`}
                            onClick={() => setActiveTab('reports')}>
                            <i className="fa-solid fa-chart-simple me-2"></i> Reports
                        </button>
                    </li>
                </ul>
            </div>

            {/* --- 1. FLOWCHART TAB --- */}
            {activeTab === 'flowchart' && (
                <div className="card border-0 shadow-sm rounded-4">
                    <div className="card-body p-4">
                        <h5 className="fw-bold mb-4 text-secondary">Manufacturing Pipeline Overview</h5>
                        <div className="d-flex flex-wrap gap-3 align-items-center justify-content-center">
                            {STAGES.map((s, index) => (
                                <React.Fragment key={s.id}>
                                    <div
                                        onClick={() => {
                                            setSelectedStage(s.id);
                                            setActiveTab('execute');
                                        }}
                                        className={`p-3 rounded-4 shadow-sm border text-center transition-all cursor-pointer hover-bg-light ${s.isFinal ? 'border-success border-2 bg-success bg-opacity-10' : s.isConversion ? 'border-warning border-2' : 'border-primary'}`}
                                        style={{width: '140px', cursor: 'pointer'}}
                                    >
                                        <div className="fw-bold fs-5 text-dark">{s.id}</div>
                                        <div className="small fw-semibold mt-1"
                                             style={{fontSize: '0.75rem', lineHeight: '1.2'}}>{s.name}</div>
                                        <div className="mt-2 badge bg-light text-secondary border w-100">{s.inUOM} <i
                                            className="fa-solid fa-arrow-right mx-1"></i> {s.outUOM}</div>
                                    </div>
                                    {index < STAGES.length - 1 && <div className="text-muted"><i
                                        className="fa-solid fa-chevron-right fs-4 opacity-50"></i></div>}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* --- 2. ISSUE RM TAB --- */}
            {activeTab === 'intake' && (
                <div className="card border-0 shadow-sm rounded-4 max-w-lg mx-auto" style={{maxWidth: '600px'}}>
                    <div className="card-header bg-success bg-opacity-10 border-0 p-4 pb-0 text-center">
                        <i className="fa-solid fa-truck-ramp-box fs-1 text-success mb-3"></i>
                        <h4 className="fw-bold text-success">Issue Raw Materials</h4>
                        <p className="text-muted small">Move materials from warehouse storage onto the factory floor to
                            begin Stage 1.</p>
                    </div>
                    <div className="card-body p-4 p-md-5 pt-2">
                        <form onSubmit={handleIntakeSubmit}>
                            <div className="mb-3">
                                <label className="form-label text-muted small fw-bold">Select Material <span
                                    className="text-danger">*</span></label>
                                <select
                                    className="form-select border-2 border-success border-opacity-50 py-2 fw-bold text-dark"
                                    required value={intakeForm.product_id} onChange={handleIntakeProductChange}>
                                    <option value="">-- Choose Raw Material --</option>
                                    {rmProducts.map(p => <option key={p.id}
                                                                 value={p.id}>{p.name} ({p.sku_code})</option>)}
                                </select>
                            </div>
                            <div className="mb-3">
                                <label className="form-label text-muted small fw-bold">Vendor Coil / Lot Number <span
                                    className="text-danger">*</span></label>
                                <input type="text" className="form-control bg-light py-2 font-monospace"
                                       placeholder="e.g. JINDAL-001" required value={intakeForm.vendor_lot_number}
                                       onChange={e => setIntakeForm({
                                           ...intakeForm,
                                           vendor_lot_number: e.target.value.toUpperCase()
                                       })}/>
                            </div>
                            <div className="row mb-4">
                                <div className="col-8">
                                    <label className="form-label text-muted small fw-bold">Total Input Quantity <span
                                        className="text-danger">*</span></label>
                                    <input type="number" step="0.01" className="form-control bg-light py-2 fw-bold"
                                           required value={intakeForm.invoice_qty}
                                           onChange={e => setIntakeForm({...intakeForm, invoice_qty: e.target.value})}/>
                                </div>
                                <div className="col-4">
                                    <label className="form-label text-muted small fw-bold">UOM</label>
                                    <input type="text" className="form-control py-2 text-center bg-light text-muted"
                                           value={intakeForm.uom} disabled/>
                                </div>
                            </div>
                            <button type="submit" disabled={loading}
                                    className="btn btn-success w-100 py-3 fw-bold rounded-3 shadow-sm">
                                {loading ? <span
                                    className="spinner-border spinner-border-sm"></span> : 'Send to Stage 1 Queue'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* --- 3. EXECUTE TAB --- */}
            {activeTab === 'execute' && (
                <div className="row g-4">
                    <div className="col-12 col-xl-3">
                        <div className="card border-0 shadow-sm rounded-4 h-100">
                            <div className="card-header bg-dark text-white border-bottom-0 pt-3 pb-3 rounded-top-4">
                                <h6 className="fw-bold text-uppercase m-0"><i
                                    className="fa-solid fa-server me-2"></i> Workstations</h6>
                            </div>
                            <div className="card-body overflow-auto p-2 custom-scrollbar" style={{maxHeight: '700px'}}>
                                <div className="list-group list-group-flush">
                                    {STAGES.map(s => (
                                        <button key={s.id} onClick={() => setSelectedStage(s.id)}
                                                className={`list-group-item list-group-item-action border-0 rounded-3 mb-1 d-flex justify-content-between align-items-center ${selectedStage === s.id ? 'active bg-primary text-white shadow' : 'text-secondary'}`}>
                                            <span><span className="fw-bold me-2">{s.id}.</span> {s.name}</span>
                                            {s.isConversion && <i className="fa-solid fa-right-left opacity-50"
                                                                  title="Conversion Stage"></i>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="col-12 col-xl-9">
                        <div className="card border-0 shadow-sm rounded-4 h-100">
                            <div className="card-body p-4 p-md-5">

                                <div
                                    className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
                                    <div>
                                        <h3 className="fw-bolder text-dark mb-1">Stage {stage.id}: {stage.name}</h3>
                                        <div className="text-muted small fw-semibold">
                                            Operator ID: <span className="text-primary">{user?.id || 'System'}</span> |
                                            Converting <span
                                            className="badge bg-light text-dark border">{stage.inUOM}</span> into <span
                                            className="badge bg-light text-dark border">{stage.outUOM}</span>
                                        </div>
                                    </div>
                                </div>

                                <form onSubmit={handleExecuteRun}>

                                    {/* STEP 1: MATERIAL FEED */}
                                    <div className="border rounded-4 p-4 mb-4 bg-light">
                                        <h6 className="fw-bold text-dark mb-3 d-flex justify-content-between align-items-center">
                                            <span><i className="fa-solid fa-boxes-stacked text-primary me-2"></i> Step 1: Select Input Material (WIP)</span>
                                            <button type="button" className="btn btn-sm btn-white border shadow-sm py-1"
                                                    onClick={() => fetchWIP(selectedStage)}>
                                                <i className="fa-solid fa-rotate-right me-1"></i> Refresh
                                            </button>
                                        </h6>

                                        {loading ? (
                                            <div className="text-center py-4">
                                                <div className="spinner-border text-primary"></div>
                                            </div>
                                        ) : wipData.length === 0 ? (
                                            selectedStage === 1 ? (
                                                <div
                                                    className="text-center py-4 bg-white rounded-4 border shadow-sm my-2">
                                                    <i className="fa-solid fa-pallet fs-2 text-success mb-2"></i>
                                                    <h6 className="fw-bold text-dark">No Materials Queued</h6>
                                                    <p className="text-muted small px-4 mb-3">Issue Raw Materials from
                                                        the warehouse to start a batch.</p>
                                                    <button type="button"
                                                            className="btn btn-sm btn-success rounded-pill px-4 fw-bold"
                                                            onClick={() => setActiveTab('intake')}>Go to Intake
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="text-center py-4 bg-white rounded-4 border my-2">
                                                    <i className="fa-solid fa-hourglass-empty fs-3 d-block mb-2 text-warning"></i>
                                                    <h6 className="fw-bold text-dark mb-1">Machine Idle</h6>
                                                    <p className="text-muted small mb-0">Waiting for material from
                                                        Stage {selectedStage - 1}.</p>
                                                </div>
                                            )
                                        ) : (
                                            <div className="table-responsive bg-white border rounded-3 shadow-sm">
                                                <table className="table table-sm table-hover align-middle mb-0">
                                                    <thead className="table-light text-muted small text-uppercase">
                                                    <tr>
                                                        <th className="ps-3 py-2">Feed</th>
                                                        <th>Product</th>
                                                        <th>Batch ID</th>
                                                        <th>Available ({stage.inUOM})</th>
                                                        <th className="pe-3">Consume ({stage.inUOM})</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
                                                    {wipData.map(wip => {
                                                        const isChecked = executeForm.selectedWips.hasOwnProperty(wip.id);
                                                        const isDisabled = !isChecked && activeWipProductId && activeWipProductId !== wip.product_id;

                                                        return (
                                                            <tr key={wip.id} className={isDisabled ? 'opacity-50' : ''}>
                                                                <td className="ps-3"><input className="form-check-input"
                                                                                            style={{
                                                                                                width: '18px',
                                                                                                height: '18px'
                                                                                            }} type="checkbox"
                                                                                            disabled={isDisabled}
                                                                                            checked={isChecked}
                                                                                            onChange={(e) => handleWipSelection(wip.id, wip.product_id, e.target.checked, wip.current_qty)}/>
                                                                </td>
                                                                <td className="fw-bold text-dark small">{wip.product_name}</td>
                                                                <td><code
                                                                    className="bg-primary bg-opacity-10 text-primary px-2 py-1 rounded fw-bold border border-primary border-opacity-25">{wip.batch_number}</code>
                                                                </td>
                                                                <td className="fw-semibold text-secondary">{wip.current_qty}</td>
                                                                <td className="pe-3">
                                                                    <input type="number" step="0.001"
                                                                           className={`form-control form-control-sm fw-bold ${isChecked ? 'border-primary' : 'bg-light'}`}
                                                                           disabled={!isChecked}
                                                                           value={isChecked ? executeForm.selectedWips[wip.id] : ''}
                                                                           onChange={(e) => handleWipQtyChange(wip.id, e.target.value)}
                                                                           max={wip.current_qty}/>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                    </tbody>
                                                </table>

                                                <div
                                                    className="bg-dark text-white p-2 px-3 d-flex justify-content-between align-items-center rounded-bottom">
                                                    <span className="small fw-semibold text-uppercase">Total Material Fed:</span>
                                                    <span
                                                        className="fw-bolder fs-6 text-warning">{totalInputQty.toFixed(2)} {stage.inUOM}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* STEP 1.5: CONSUMABLES (PACKAGING) NEW FEATURE */}
                                    <div className="border rounded-4 p-4 mb-4 bg-white shadow-sm">
                                        <div className="d-flex justify-content-between align-items-center mb-3">
                                            <h6 className="fw-bold text-dark m-0"><i className="fa-solid fa-box-open text-warning me-2"></i> Additional Consumables / Packaging</h6>
                                            <button type="button" className="btn btn-sm btn-outline-warning fw-bold rounded-pill" onClick={addRM}>
                                                <i className="fa-solid fa-plus me-1"></i> Add Material
                                            </button>
                                        </div>

                                        {executeForm.consumed_materials.length === 0 ? (
                                            <p className="text-muted small mb-0">No additional packaging or raw materials added for this run.</p>
                                        ) : (
                                            executeForm.consumed_materials.map((rm, idx) => (
                                                <div key={idx} className="row g-2 mb-2 align-items-center bg-light p-2 rounded border">
                                                    <div className="col-md-4">
                                                        <select className="form-select form-select-sm fw-bold text-dark" value={rm.product_id} onChange={(e) => updateRM(idx, 'product_id', e.target.value)}>
                                                            <option value="">-- Select Material --</option>
                                                            {rmProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="col-md-4">
                                                        <input type="text" className="form-control form-control-sm font-monospace" placeholder="Batch / Roll #" value={rm.batch_number} onChange={(e) => updateRM(idx, 'batch_number', e.target.value)} />
                                                    </div>
                                                    <div className="col-md-3">
                                                        <input type="number" step="0.001" className="form-control form-control-sm text-primary fw-bold" placeholder="Qty Consumed" value={rm.qty_to_consume} onChange={(e) => updateRM(idx, 'qty_to_consume', e.target.value)} />
                                                    </div>
                                                    <div className="col-md-1 text-end">
                                                        <button type="button" className="btn btn-sm btn-danger px-2 py-1" onClick={() => removeRM(idx)}><i className="fa-solid fa-xmark"></i></button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* STEP 2: PROCESS OPTIONS */}
                                    <div className="border rounded-4 p-4 mb-4 bg-white shadow-sm">
                                        <h6 className="fw-bold text-dark mb-3"><i
                                            className="fa-solid fa-sliders text-info me-2"></i> Step 2: Process
                                            Parameters</h6>
                                        <div className="row g-3">
                                            <div className="col-md-6">
                                                <label className="form-label small fw-bold text-muted">Machine / Line
                                                    Selection</label>
                                                <select className="form-select bg-light py-2 fw-semibold"
                                                        value={processOptions.machine_id}
                                                        onChange={e => setProcessOptions({
                                                            ...processOptions,
                                                            machine_id: e.target.value
                                                        })}>
                                                    <option value="Line A">Production Line A</option>
                                                    <option value="Line B">Production Line B</option>
                                                    <option value="Machine 01">Standalone Machine 01</option>
                                                </select>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label small fw-bold text-muted">Operator
                                                    Shift</label>
                                                <select className="form-select bg-light py-2 fw-semibold"
                                                        value={processOptions.shift} onChange={e => setProcessOptions({
                                                    ...processOptions,
                                                    shift: e.target.value
                                                })}>
                                                    <option value="Morning (06:00 - 14:00)">Morning (06:00 - 14:00)
                                                    </option>
                                                    <option value="Evening (14:00 - 22:00)">Evening (14:00 - 22:00)
                                                    </option>
                                                    <option value="Night (22:00 - 06:00)">Night (22:00 - 06:00)</option>
                                                </select>
                                            </div>
                                            <div className="col-12">
                                                <label className="form-label small fw-bold text-muted">Operator Remarks
                                                    / Settings</label>
                                                <input type="text" className="form-control bg-light py-2"
                                                       placeholder="e.g. Temperature 800°C, Speed 50rpm..."
                                                       value={processOptions.notes} onChange={e => setProcessOptions({
                                                    ...processOptions,
                                                    notes: e.target.value
                                                })}/>
                                            </div>
                                        </div>
                                    </div>

                                    {/* STEP 3: OUTPUT & GRANULAR SCRAP */}
                                    <div className="border rounded-4 p-4 mb-4 bg-white shadow-sm">
                                        <h6 className="fw-bold text-dark mb-3"><i
                                            className="fa-solid fa-square-poll-vertical text-success me-2"></i> Step 3:
                                            Log Output & Granular Scrap</h6>
                                        <div className="row g-4">
                                            {/* Good Output */}
                                            <div className="col-md-12">
                                                <div
                                                    className="border rounded-4 p-3 bg-light border-start border-4 border-success">
                                                    <label className="form-label fw-bold text-dark mb-1">Good
                                                        Output <span
                                                            className="badge bg-white text-dark border ms-1">{stage.outUOM}</span></label>
                                                    {(selectedStage === 12 || selectedStage === 15) ? (
                                                        <p className="text-primary small mb-2 fw-bold"
                                                           style={{fontSize: '0.75rem'}}>
                                                            <i className="fa-solid fa-calculator me-1"></i>
                                                            Auto-calculated based on rules.
                                                        </p>
                                                    ) : (
                                                        <p className="text-muted small mb-2"
                                                           style={{fontSize: '0.75rem'}}>Passed QC and moving to next
                                                            stage.</p>
                                                    )}
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        className={`form-control form-control-lg bg-white border-success border-opacity-25 fw-bold shadow-sm ${(selectedStage === 12 || selectedStage === 15) ? 'text-primary bg-primary bg-opacity-10' : 'text-success'}`}
                                                        required
                                                        value={executeForm.good_output_qty}
                                                        onChange={e => setExecuteForm({
                                                            ...executeForm,
                                                            good_output_qty: e.target.value
                                                        })}
                                                        placeholder="0.0"
                                                        readOnly={selectedStage === 12 || selectedStage === 15}
                                                    />
                                                </div>
                                            </div>

                                            {/* Granular Scrap Log */}
                                            <div className="col-md-12">
                                                <div className="border rounded-4 p-3 bg-light border-start border-4 border-danger">
                                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                                        <label className="form-label fw-bold text-dark m-0">Scrap / Waste Log</label>
                                                        <button type="button" className="btn btn-sm btn-danger bg-opacity-10 text-danger border-danger border-opacity-25 fw-bold rounded-pill" onClick={addScrap}>
                                                            <i className="fa-solid fa-plus me-1"></i> Log Defect
                                                        </button>
                                                    </div>

                                                    {executeForm.scrap_details.length === 0 ? (
                                                        <p className="text-muted small mb-0 font-monospace">No scrap logged for this run.</p>
                                                    ) : (
                                                        executeForm.scrap_details.map((scrap, idx) => (
                                                            <div key={idx} className="row g-2 mb-2 align-items-center">
                                                                <div className="col-md-4">
                                                                    <select className="form-select form-select-sm" value={scrap.reason_id} onChange={(e) => updateScrap(idx, 'reason_id', e.target.value)}>
                                                                        <option value="">-- Defect Reason --</option>
                                                                        {scrapReasons.map(r => <option key={r.id} value={r.id}>{r.description}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="col-md-4">
                                                                    <select className="form-select form-select-sm text-secondary" value={scrap.product_id} onChange={(e) => updateScrap(idx, 'product_id', e.target.value)}>
                                                                        <option value="">-- Scrapped Item --</option>
                                                                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="col-md-3">
                                                                    <input type="number" step="0.001" className="form-control form-control-sm text-danger fw-bold" placeholder="Qty" value={scrap.qty} onChange={(e) => updateScrap(idx, 'qty', e.target.value)} />
                                                                </div>
                                                                <div className="col-md-1 text-end">
                                                                    <button type="button" className="btn btn-sm btn-outline-danger px-2 py-1" onClick={() => removeScrap(idx)}><i className="fa-solid fa-trash"></i></button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* QC SIGNOFF */}
                                    <div
                                        className="bg-warning bg-opacity-10 border border-warning border-opacity-50 rounded-4 p-3 mb-4 d-flex align-items-center">
                                        <div className="form-check form-switch fs-5 mb-0 d-flex align-items-center">
                                            <input className="form-check-input cursor-pointer me-3 mt-0" type="checkbox"
                                                   id="qcCheck" checked={processOptions.qc_passed}
                                                   onChange={e => setProcessOptions({
                                                       ...processOptions,
                                                       qc_passed: e.target.checked
                                                   })} style={{width: '50px', height: '25px'}}/>
                                            <label className="form-check-label fw-bold text-dark" htmlFor="qcCheck">
                                                Quality Control Sign-off <br/>
                                                <span className="fs-6 text-muted fw-normal">I confirm the output meets physical tolerances and scrap is logged accurately.</span>
                                            </label>
                                        </div>
                                    </div>

                                    <button type="submit"
                                            disabled={loading || totalInputQty === 0 || !processOptions.qc_passed}
                                            className="btn btn-primary btn-lg w-100 py-3 fw-bolder rounded-pill shadow">
                                        {loading ? <span className="spinner-border spinner-border-sm me-2"></span> :
                                            <i className="fa-solid fa-play me-2"></i>}
                                        {stage.isFinal ? 'BOX FINISHED GOODS' : `EXECUTE STAGE ${stage.id} & PUSH TO NEXT`}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- 4. WIP TAB --- */}
            {activeTab === 'wip' && (
                <div className="card border-0 shadow-sm rounded-4">
                    <div
                        className="card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
                        <h5 className="fw-bold mb-0"><i className="fa-solid fa-layer-group text-primary me-2"></i> Floor
                            WIP Monitor</h5>
                        <select
                            className="form-select w-auto fw-bold text-primary border-primary bg-primary bg-opacity-10"
                            value={selectedStage} onChange={(e) => setSelectedStage(parseInt(e.target.value))}>
                            {STAGES.map(s => <option key={s.id} value={s.id}>Stage {s.id}: {s.name}</option>)}
                        </select>
                    </div>
                    <div className="card-body p-0">
                        {loading ? <div className="p-5 text-center">
                            <div className="spinner-border text-primary"></div>
                        </div> : (
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light">
                                    <tr>
                                        <th className="px-4 py-3">Internal Batch #</th>
                                        <th>Product</th>
                                        <th>Stage Queued</th>
                                        <th>Qty Available</th>
                                        <th>Status</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {wipData.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="text-center py-5 text-muted fw-bold"><i
                                                className="fa-solid fa-check-double fs-2 d-block mb-3 opacity-50"></i> Floor
                                                is clear at this stage.
                                            </td>
                                        </tr>
                                    ) : wipData.map(wip => (
                                        <tr key={wip.id}>
                                            <td className="px-4 fw-bold text-dark"><code>{wip.batch_number}</code></td>
                                            <td className="text-secondary fw-semibold small">{wip.product_name}</td>
                                            <td><span
                                                className="badge bg-light text-dark border">Stage {selectedStage}</span>
                                            </td>
                                            <td className="fw-bolder fs-6">{wip.current_qty} <span
                                                className="small fw-normal text-muted">{wip.uom}</span></td>
                                            <td><span
                                                className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1">AVAILABLE</span>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- 5. LEDGER TAB --- */}
            {activeTab === 'ledger' && (
                <div className="card border-0 shadow-sm rounded-4">
                    <div
                        className="card-header bg-white border-bottom p-4 d-flex justify-content-between align-items-center">
                        <h5 className="fw-bold mb-0"><i className="fa-solid fa-list-check text-dark me-2"></i> Process
                            Audit Ledger</h5>
                        <input type="text" className="form-control w-auto bg-light border-0 shadow-sm"
                               placeholder="Search logs..." value={searchTerm}
                               onChange={(e) => setSearchTerm(e.target.value)}/>
                    </div>
                    <div className="card-body p-0 overflow-auto custom-scrollbar" style={{maxHeight: '70vh'}}>
                        {ledgerLoading ? <div className="p-5 text-center">
                            <div className="spinner-border text-primary"></div>
                        </div> : (
                            <table className="table table-hover align-middle mb-0" style={{fontSize: '0.9rem'}}>
                                <thead className="bg-dark text-white sticky-top">
                                <tr>
                                    <th className="px-4 py-3 fw-bold border-secondary">Date</th>
                                    <th className="fw-bold border-secondary">Product / SKU</th>
                                    <th className="fw-bold border-secondary">Batch #</th>
                                    <th className="fw-bold border-secondary">Transaction Event</th>
                                    <th className="text-center fw-bold border-secondary">Delta</th>
                                    <th className="text-center fw-bold border-secondary pe-4">Action</th>
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
                                                <div className="text-muted small font-monospace">{row.sku}</div>
                                            </td>
                                            <td><code
                                                className="bg-light text-dark px-2 py-1 border rounded">{row.batch_number}</code>
                                            </td>
                                            <td>
                                                <span className="fw-semibold text-secondary"
                                                      style={{fontSize: '0.8rem'}}>{row.transaction_type.replace(/_/g, ' ')}</span>
                                                {row.stage_id &&
                                                    <div className="text-muted small mt-1">Stage: {row.stage_id}</div>}
                                            </td>
                                            <td className="text-center fw-bold fs-6">{getQtyBadge(row.quantity_change, row.transaction_type)}</td>
                                            <td className="text-center pe-4">
                                                {canUndo && (
                                                    <button onClick={() => handleReverseRun(runId)}
                                                            className="btn btn-sm btn-outline-danger py-1 px-3 rounded-pill fw-bold"
                                                            title="Reverse this Run">
                                                        <i className="fa-solid fa-rotate-left me-1"></i> Undo
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* --- 6. REPORTS & ANALYTICS DASHBOARD --- */}
            {activeTab === 'reports' && (
                <div className="fade-in">
                    {ledgerLoading ? (
                        <div className="p-5 text-center mt-5">
                            <div className="spinner-border fs-3 text-info"></div>
                            <p className="mt-3 text-muted">Crunching big data...</p></div>
                    ) : ledgerData.length === 0 ? (
                        <div className="card border-0 shadow-sm p-5 text-center rounded-4">
                            <i className="fa-solid fa-chart-pie fs-1 text-muted mb-3 opacity-50"></i>
                            <h5 className="fw-bold text-dark">No Data Available</h5>
                            <p className="text-muted">Start running batches to generate your visual dashboard.</p>
                        </div>
                    ) : (
                        <>
                            <div className="row g-4 mb-4">
                                <div className="col-12 col-md-3">
                                    <div
                                        className="card border-0 shadow-sm rounded-4 bg-primary text-white p-4 h-100 position-relative overflow-hidden">
                                        <i className="fa-solid fa-percent position-absolute text-white opacity-25"
                                           style={{fontSize: '6rem', right: '-15px', bottom: '-15px'}}></i>
                                        <h6 className="fw-semibold opacity-75 mb-1">Overall Yield Rate</h6>
                                        <h2 className="fw-bolder mb-0 display-6">{reportStats.yieldPercent}%</h2>
                                        <div className="small mt-2 opacity-75">Good Output vs Waste</div>
                                    </div>
                                </div>
                                <div className="col-12 col-md-3">
                                    <div
                                        className="card border-0 shadow-sm rounded-4 bg-white p-4 h-100 border-start border-4 border-info">
                                        <h6 className="fw-semibold text-muted mb-1">Total RM Intake</h6>
                                        <h2 className="fw-bolder text-dark mb-0">{reportStats.rmIntake.toFixed(0)} <span
                                            className="fs-6 text-muted">KG</span></h2>
                                        <div className="small mt-2 text-info"><i
                                            className="fa-solid fa-arrow-down me-1"></i> Raw Material In
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12 col-md-3">
                                    <div
                                        className="card border-0 shadow-sm rounded-4 bg-white p-4 h-100 border-start border-4 border-danger">
                                        <h6 className="fw-semibold text-muted mb-1">Total Scrap Lost</h6>
                                        <h2 className="fw-bolder text-danger mb-0">{reportStats.scrap.toFixed(2)}</h2>
                                        <div className="small mt-2 text-danger"><i
                                            className="fa-solid fa-trash-can me-1"></i> Units / KGs wasted
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12 col-md-3">
                                    <div
                                        className="card border-0 shadow-sm rounded-4 bg-white p-4 h-100 border-start border-4 border-success">
                                        <h6 className="fw-semibold text-muted mb-1">Finished Goods</h6>
                                        <h2 className="fw-bolder text-success mb-0">{reportStats.fg.toFixed(0)} <span
                                            className="fs-6 text-muted">BOXES</span></h2>
                                        <div className="small mt-2 text-success"><i
                                            className="fa-solid fa-box-open me-1"></i> Ready for Warehouse
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="card border-0 shadow-sm rounded-4">
                                <div className="card-header bg-white border-bottom p-4">
                                    <h5 className="fw-bold mb-0 text-dark"><i
                                        className="fa-solid fa-chart-bar text-primary me-2"></i> Stage Production &
                                        Waste Analytics</h5>
                                </div>
                                <div className="card-body p-4">
                                    <div className="d-flex mb-4 gap-4 align-items-center bg-light p-3 rounded-3 border">
                                        <div className="d-flex align-items-center">
                                            <div className="bg-success rounded me-2"
                                                 style={{width: '16px', height: '16px'}}></div>
                                            <span className="small fw-semibold text-muted">Good Volume Generated</span>
                                        </div>
                                        <div className="d-flex align-items-center">
                                            <div className="bg-danger rounded me-2"
                                                 style={{width: '16px', height: '16px'}}></div>
                                            <span className="small fw-semibold text-muted">Scrap Recorded</span></div>
                                        <div className="text-muted small ms-auto fst-italic">* Charts auto-scale
                                            relative to highest active volume.
                                        </div>
                                    </div>

                                    <div className="table-responsive">
                                        <table className="table table-borderless align-middle m-0">
                                            <tbody>
                                            {STAGES.map(s => {
                                                const data = reportStats.stageActivity[s.id] || {out: 0, scrap: 0};
                                                const totalVolume = data.out + data.scrap;

                                                const scaleFactor = reportStats.maxStageVolume > 0 ? 100 / reportStats.maxStageVolume : 0;
                                                const outWidth = totalVolume > 0 ? (data.out * scaleFactor) : 0;
                                                const scrapWidth = totalVolume > 0 ? (data.scrap * scaleFactor) : 0;

                                                if (totalVolume === 0) return null;

                                                return (
                                                    <tr key={s.id} className="border-bottom">
                                                        <td className="py-3" style={{width: '25%'}}>
                                                            <div
                                                                className="fw-bold text-dark small">Stage {s.id}: {s.name}</div>
                                                            <div className="text-muted"
                                                                 style={{fontSize: '0.7rem'}}>Outputs: {s.outUOM}</div>
                                                        </td>
                                                        <td className="py-3" style={{width: '60%'}}>
                                                            <div className="progress bg-light shadow-none"
                                                                 style={{height: '20px', borderRadius: '10px'}}>
                                                                {outWidth > 0 && (
                                                                    <div className="progress-bar bg-success"
                                                                         role="progressbar"
                                                                         style={{width: `${outWidth}%`}}
                                                                         title={`Output: ${data.out.toFixed(2)}`}></div>
                                                                )}
                                                                {scrapWidth > 0 && (
                                                                    <div
                                                                        className="progress-bar bg-danger progress-bar-striped"
                                                                        role="progressbar"
                                                                        style={{width: `${scrapWidth}%`}}
                                                                        title={`Scrap: ${data.scrap.toFixed(2)}`}></div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 text-end" style={{width: '15%'}}>
                                                            <div
                                                                className="fw-bolder text-success small">+{data.out.toFixed(1)}</div>
                                                            {data.scrap > 0 && <div
                                                                className="fw-bolder text-danger small">-{data.scrap.toFixed(1)}</div>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

        </div>
    );
}