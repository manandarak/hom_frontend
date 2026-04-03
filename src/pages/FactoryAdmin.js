import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

export default function FactoryAdmin() {
    const [activeTab, setActiveTab] = useState('bom');
    const [products, setProducts] = useState([]);
    const [stages, setStages] = useState([]);

    // --- FORMS ---
    // 1. Bill of Materials (Recipe) Form
    const [bomForm, setBomForm] = useState({
        output_product_id: '',
        stage_id: '',
        base_qty: 1,
        items: [{ input_product_id: '', expected_qty: '' }]
    });

    // 2. Packaging Hierarchy Form
    const [packForm, setPackForm] = useState({
        product_id: '',
        packaging_type: 'Master Carton',
        contains_qty: '',
        inner_product_id: ''
    });

    // 3. Machine / Line Form
    const [machineForm, setMachineForm] = useState({
        name: '',
        stage_id: '',
        status: 'Active'
    });

    useEffect(() => {
        fetchMasterData();
    }, []);

    const fetchMasterData = async () => {
        try {
            const [prodRes, stageRes] = await Promise.all([
                api.get('/products/'),
                api.get('/production/stages') // Assuming you have a basic CRUD endpoint for this
            ]);
            setProducts(prodRes.data || []);
            setStages(stageRes.data || []);
        } catch (error) {
            toast.error("Failed to load master data.");
        }
    };

    // --- BOM HANDLERS ---
    const handleAddBomItem = () => {
        setBomForm({ ...bomForm, items: [...bomForm.items, { input_product_id: '', expected_qty: '' }] });
    };

    const handleSaveBOM = async (e) => {
        e.preventDefault();
        const toastId = toast.loading('Saving new Recipe...');
        try {
            await api.post('/admin/bom', bomForm);
            toast.success('BOM Saved Successfully! Workers will now use this recipe.', { id: toastId });
            setBomForm({ output_product_id: '', stage_id: '', base_qty: 1, items: [{ input_product_id: '', expected_qty: '' }] });
        } catch (error) {
            toast.error('Failed to save BOM.', { id: toastId });
        }
    };

    // --- PACKAGING HANDLERS ---
    const handleSavePackaging = async (e) => {
        e.preventDefault();
        const toastId = toast.loading('Saving Packaging Rule...');
        try {
            await api.post('/admin/packaging', packForm);
            toast.success('Packaging rule saved! Order logic is now updated.', { id: toastId });
            setPackForm({ product_id: '', packaging_type: 'Master Carton', contains_qty: '', inner_product_id: '' });
        } catch (error) {
            toast.error('Failed to save packaging.', { id: toastId });
        }
    };

    return (
        <div className="p-4 bg-light min-vh-100">
            <Toaster position="top-right" />

            <div className="mb-4">
                <h2 className="fw-bolder text-dark mb-0"><i className="fa-solid fa-user-tie text-primary me-2"></i> Production Admin Console</h2>
                <p className="text-muted small mt-1">Define Master Recipes, Packaging Rules, and Factory Work Centers</p>
            </div>

            <ul className="nav nav-tabs mb-4 border-bottom-0">
                <li className="nav-item">
                    <button className={`nav-link fw-bold ${activeTab === 'bom' ? 'active bg-white border-bottom-0 rounded-top' : 'text-secondary bg-light'}`} onClick={() => setActiveTab('bom')}>
                        <i className="fa-solid fa-clipboard-list me-2"></i> Master BOMs (Recipes)
                    </button>
                </li>
                <li className="nav-item ms-2">
                    <button className={`nav-link fw-bold ${activeTab === 'pack' ? 'active bg-white border-bottom-0 rounded-top' : 'text-secondary bg-light'}`} onClick={() => setActiveTab('pack')}>
                        <i className="fa-solid fa-box-open me-2"></i> Packaging Rules
                    </button>
                </li>
                <li className="nav-item ms-2">
                    <button className={`nav-link fw-bold ${activeTab === 'machine' ? 'active bg-white border-bottom-0 rounded-top' : 'text-secondary bg-light'}`} onClick={() => setActiveTab('machine')}>
                        <i className="fa-solid fa-network-wired me-2"></i> Production Lines
                    </button>
                </li>
            </ul>

            <div className="card border shadow-sm rounded-4 bg-white p-4">

                {/* --- TAB 1: DEFINE RECIPES (BOM) --- */}
                {activeTab === 'bom' && (
                    <form onSubmit={handleSaveBOM}>
                        <h5 className="fw-bold mb-3 text-dark">Define Bill of Materials</h5>
                        <p className="text-muted small">Teach the system what materials are required to build a specific product at a specific stage.</p>

                        <div className="row g-3 mb-4 bg-light p-3 rounded">
                            <div className="col-md-5">
                                <label className="form-label small fw-bold">Target Output Product</label>
                                <select className="form-select border-primary" required value={bomForm.output_product_id} onChange={e => setBomForm({...bomForm, output_product_id: e.target.value})}>
                                    <option value="">-- Select Product --</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-5">
                                <label className="form-label small fw-bold">At Which Stage?</label>
                                <select className="form-select border-primary" required value={bomForm.stage_id} onChange={e => setBomForm({...bomForm, stage_id: e.target.value})}>
                                    <option value="">-- Select Stage --</option>
                                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <label className="form-label small fw-bold">Base Qty</label>
                                <input type="number" className="form-control text-center fw-bold" value={bomForm.base_qty} onChange={e => setBomForm({...bomForm, base_qty: e.target.value})} />
                            </div>
                        </div>

                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="fw-bold m-0">Required Ingredients / Consumables</h6>
                            <button type="button" className="btn btn-sm btn-outline-primary rounded-pill fw-bold" onClick={handleAddBomItem}>+ Add Ingredient</button>
                        </div>

                        {bomForm.items.map((item, idx) => (
                            <div key={idx} className="row g-2 mb-2 align-items-center">
                                <div className="col-md-8">
                                    <select className="form-select" required value={item.input_product_id} onChange={(e) => {
                                        const newItems = [...bomForm.items];
                                        newItems[idx].input_product_id = e.target.value;
                                        setBomForm({...bomForm, items: newItems});
                                    }}>
                                        <option value="">-- Select Raw Material / WIP --</option>
                                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-md-3">
                                    <input type="number" step="0.001" className="form-control text-primary fw-bold" placeholder="Required Qty" required value={item.expected_qty} onChange={(e) => {
                                        const newItems = [...bomForm.items];
                                        newItems[idx].expected_qty = e.target.value;
                                        setBomForm({...bomForm, items: newItems});
                                    }}/>
                                </div>
                            </div>
                        ))}

                        <button type="submit" className="btn btn-primary mt-4 py-2 px-5 fw-bold rounded-pill shadow-sm">Save Master Recipe</button>
                    </form>
                )}

                {/* --- TAB 2: PACKAGING RULES --- */}
                {activeTab === 'pack' && (
                    <form onSubmit={handleSavePackaging}>
                        <h5 className="fw-bold mb-3 text-dark">Define Packaging Hierarchy</h5>
                        <p className="text-muted small">Teach the order system how to unpack boxes. (e.g. 1 Master Carton = 100 Display Boxes)</p>

                        <div className="row g-4 align-items-end">
                            <div className="col-md-4">
                                <label className="form-label small fw-bold">The Outer SKU (e.g., Master Carton)</label>
                                <select className="form-select border-primary" required value={packForm.product_id} onChange={e => setPackForm({...packForm, product_id: e.target.value})}>
                                    <option value="">-- Select Outer Product --</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div className="col-md-1 text-center fs-4 text-muted d-none d-md-block">=</div>

                            <div className="col-md-2">
                                <label className="form-label small fw-bold">Contains Qty</label>
                                <input type="number" className="form-control text-center fw-bold fs-5 text-primary" placeholder="100" required value={packForm.contains_qty} onChange={e => setPackForm({...packForm, contains_qty: e.target.value})} />
                            </div>

                            <div className="col-md-1 text-center fs-6 text-muted d-none d-md-block">X</div>

                            <div className="col-md-4">
                                <label className="form-label small fw-bold">Of Inner SKU (e.g., Display Box)</label>
                                <select className="form-select border-warning" required value={packForm.inner_product_id} onChange={e => setPackForm({...packForm, inner_product_id: e.target.value})}>
                                    <option value="">-- Select Inner Product --</option>
                                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary mt-5 py-2 px-5 fw-bold rounded-pill shadow-sm">Save Hierarchy Rule</button>
                    </form>
                )}

            </div>
        </div>
    );
}