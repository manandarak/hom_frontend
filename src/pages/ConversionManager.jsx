import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

export default function ConversionManager() {
  const [boms, setBoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    output_product_id: '',
    stage_id: '',
    base_qty: 1,
    items: [{ input_product_id: '', expected_qty: '' }]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bomsRes, prodRes, stagesRes] = await Promise.all([
        api.get('/production/boms').catch(() => ({ data: [] })),
        api.get('/products/'),
        api.get('/production/stages')
      ]);
      setBoms(bomsRes.data || []);
      setProducts(prodRes.data || []);
      setStages((stagesRes.data || []).sort((a, b) => a.sequence_number - b.sequence_number));
    } catch (err) {
      toast.error('Failed to load conversion rules.');
    } finally {
      setLoading(false);
    }
  };

  // --- FORM DYNAMICS ---
  const addItem = () => setFormData(p => ({ ...p, items: [...p.items, { input_product_id: '', expected_qty: '' }] }));
  const updateItem = (idx, field, val) => {
    const newItems = [...formData.items];
    newItems[idx][field] = val;
    setFormData(p => ({ ...p, items: newItems }));
  };
  const removeItem = (idx) => {
    const newItems = [...formData.items];
    newItems.splice(idx, 1);
    setFormData(p => ({ ...p, items: newItems }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) return toast.error("You must add at least one input material.");

    const payload = {
      output_product_id: parseInt(formData.output_product_id),
      stage_id: parseInt(formData.stage_id),
      base_qty: parseFloat(formData.base_qty),
      items: formData.items.map(i => ({
        input_product_id: parseInt(i.input_product_id),
        expected_qty: parseFloat(i.expected_qty)
      }))
    };

    const toastId = toast.loading('Saving Conversion Rule...');
    try {
      await api.post('/production/boms', payload);
      toast.success('Recipe saved successfully!', { id: toastId });
      setIsModalOpen(false);
      setFormData({ output_product_id: '', stage_id: '', base_qty: 1, items: [{ input_product_id: '', expected_qty: '' }] });
      fetchData();
    } catch (err) {
      toast.error('Failed to save rule.', { id: toastId });
    }
  };

  const getProductName = (id) => products.find(p => p.id === id)?.name || 'Unknown';
  const getStageName = (id) => stages.find(s => s.id === id)?.name || 'Unknown';

  if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div>;

  return (
    <div className="container-fluid p-4 bg-light min-vh-100">
      <Toaster position="top-right" />

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bolder m-0 text-dark"><i className="fa-solid fa-code-branch text-primary me-2"></i> Conversion & BOM Rules</h3>
          <p className="text-muted m-0 mt-1">Define recipes for how materials convert into finished goods.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary rounded-pill fw-bold shadow-sm px-4">
          <i className="fa-solid fa-plus me-2"></i> Create New Rule
        </button>
      </div>

      {/* DATA GRID */}
      <div className="row g-4">
        {boms.length === 0 ? (
          <div className="col-12 text-center py-5 text-muted">No conversion rules set up yet.</div>
        ) : boms.map(bom => (
          <div key={bom.id} className="col-md-6 col-xl-4">
             <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-header bg-white border-bottom p-3 d-flex justify-content-between align-items-center">
                   <h6 className="m-0 fw-bolder text-primary">To Make: {bom.base_qty}x {getProductName(bom.output_product_id)}</h6>
                   <span className="badge bg-light text-dark border">{getStageName(bom.stage_id)}</span>
                </div>
                <div className="card-body p-3 bg-light rounded-bottom-4">
                   <div className="small fw-bold text-muted mb-2 text-uppercase">Required Inputs:</div>
                   <ul className="list-group list-group-flush rounded-3 border shadow-sm">
                      {bom.items.map(item => (
                         <li key={item.id} className="list-group-item d-flex justify-content-between align-items-center py-2">
                            <span className="fw-semibold text-dark">{getProductName(item.input_product_id)}</span>
                            <span className="badge bg-warning bg-opacity-10 text-warning border border-warning fw-bold">{item.expected_qty} units</span>
                         </li>
                      ))}
                   </ul>
                </div>
             </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="card border-0 shadow-lg rounded-4 overflow-hidden" style={{ width: '650px' }}>
            <div className="card-header bg-dark text-white p-3 d-flex justify-content-between">
              <h5 className="m-0 fw-bold">Define Conversion Rule</h5>
              <button type="button" className="btn-close btn-close-white" onClick={() => setIsModalOpen(false)}></button>
            </div>
            <div className="card-body p-4">
              <form onSubmit={handleSave}>
                {/* TARGET OUTPUT */}
                <h6 className="fw-bold text-primary mb-3">1. Target Output</h6>
                <div className="row g-3 mb-4 p-3 bg-light border rounded-3">
                  <div className="col-md-8">
                    <label className="form-label small fw-bold text-muted">Output Product</label>
                    <select className="form-select fw-bold" required value={formData.output_product_id} onChange={e => setFormData({...formData, output_product_id: e.target.value})}>
                      <option value="">Select Resulting Product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-bold text-muted">Base Qty Produced</label>
                    <input type="number" step="0.01" className="form-control fw-bold text-primary" required value={formData.base_qty} onChange={e => setFormData({...formData, base_qty: e.target.value})} />
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-bold text-muted">At Manufacturing Stage</label>
                    <select className="form-select" required value={formData.stage_id} onChange={e => setFormData({...formData, stage_id: e.target.value})}>
                      <option value="">Select Stage...</option>
                      {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* REQUIRED INPUTS */}
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold text-warning mb-0">2. Required Inputs (Ingredients)</h6>
                  <button type="button" className="btn btn-sm btn-outline-warning fw-bold rounded-pill" onClick={addItem}>+ Add Input</button>
                </div>

                {formData.items.map((item, idx) => (
                  <div key={idx} className="d-flex gap-2 mb-2">
                    <select className="form-select" required value={item.input_product_id} onChange={e => updateItem(idx, 'input_product_id', e.target.value)}>
                      <option value="">Select Input Material...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="number" step="0.001" className="form-control w-25 fw-bold" placeholder="Qty Required" required value={item.expected_qty} onChange={e => updateItem(idx, 'expected_qty', e.target.value)} />
                    <button type="button" className="btn btn-danger px-3" onClick={() => removeItem(idx)}>X</button>
                  </div>
                ))}

                <button type="submit" className="btn btn-primary w-100 mt-4 py-2 fw-bold rounded-pill">Save Conversion Rule</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}