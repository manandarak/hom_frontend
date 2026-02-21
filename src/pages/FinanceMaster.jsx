import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

export default function FinanceMaster() {
  const [loading, setLoading] = useState(false);

  // --- MASTER DATA (For Dropdowns) ---
  const [masterData, setMasterData] = useState({
    ss: [],
    distributors: [],
    retailers: []
  });

  // --- LEDGER STATE ---
  const [ledgerParams, setLedgerParams] = useState({ party_type: 'ss', party_id: '' });
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerBalance, setLedgerBalance] = useState(0); // Optional: if backend returns a running balance

  // --- MODAL & PAYMENT STATE ---
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    party_type: 'ss',
    party_id: '',
    amount: '',
    payment_mode: 'UPI',
    reference_number: '',
    remarks: ''
  });

  // --- 1. HYDRATE PARTNER DATA ON MOUNT ---
  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const [ssRes, distRes, retRes] = await Promise.all([
          api.get('/partners/super-stockists').catch(() => ({ data: [] })),
          api.get('/partners/distributors').catch(() => ({ data: [] })),
          api.get('/partners/retailers').catch(() => ({ data: [] }))
        ]);

        setMasterData({
          ss: Array.isArray(ssRes.data) ? ssRes.data : ssRes.data?.items || [],
          distributors: Array.isArray(distRes.data) ? distRes.data : distRes.data?.items || [],
          retailers: Array.isArray(retRes.data) ? retRes.data : retRes.data?.items || []
        });
      } catch (err) {
        console.error("Partner hydration failed", err);
      }
    };
    fetchPartners();
  }, []);

  // --- HELPERS ---
  const getActiveList = (type) => {
    if (type === 'ss' || type === 'super_stockist') return masterData.ss;
    if (type === 'distributor') return masterData.distributors;
    if (type === 'retailer') return masterData.retailers;
    return [];
  };

  const getPartnerName = (type, id) => {
    const list = getActiveList(type);
    const partner = list.find(x => x.id === parseInt(id));
    if (!partner) return `Unknown Entity (${id})`;
    return partner.name || partner.firm_name || partner.shop_name || `Entity ${id}`;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  };

  // --- API CALLS ---
  const fetchLedger = async (e) => {
    if (e) e.preventDefault();
    if (!ledgerParams.party_id) return toast.error("Please select a specific partner.");

    setLoading(true);
    try {
      const res = await api.get(`/finance/ledger/${ledgerParams.party_type}/${ledgerParams.party_id}`);

      // Assuming backend returns { balance: 5000, transactions: [...] } OR just an array [...]
      if (Array.isArray(res.data)) {
        setLedgerData(res.data);
      } else {
        setLedgerData(res.data.transactions || res.data.items || []);
        setLedgerBalance(res.data.current_balance || res.data.outstanding_balance || 0);
      }
      toast.success('Ledger synchronized');
    } catch (err) {
      toast.error("Failed to load financial ledger.");
      setLedgerData([]);
    } finally { setLoading(false); }
  };

  const handleReceivePayment = async (e) => {
    e.preventDefault();
    const toastId = toast.loading('Processing payment securely...');
    try {
      const payload = { ...paymentForm };
      payload.party_id = parseInt(payload.party_id);
      payload.amount = parseFloat(payload.amount);

      await api.post('/finance/payments', payload);

      toast.success('Payment received & logged successfully!', { id: toastId });
      setIsPaymentModalOpen(false);
      setPaymentForm({ party_type: 'ss', party_id: '', amount: '', payment_mode: 'UPI', reference_number: '', remarks: '' });

      // If we are currently viewing this exact person's ledger, refresh it automatically!
      if (ledgerParams.party_type === payload.party_type && parseInt(ledgerParams.party_id) === payload.party_id) {
        fetchLedger();
      }
    } catch (err) {
      toast.error(`Transaction Failed: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-indian-rupee-sign text-primary me-2"></i> Finance & Accounts
          </h3>
          <p className="text-muted m-0 mt-1">Manage accounts receivable and monitor partner ledgers.</p>
        </div>
        <button className="btn btn-success shadow-sm rounded-pill px-4 fw-semibold btn-lg" onClick={() => setIsPaymentModalOpen(true)}>
          <i className="fa-solid fa-cash-register me-2"></i> Receive Payment
        </button>
      </div>

      {/* LEDGER QUERY BAR */}
      <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white">
        <div className="card-body p-3">
          <form onSubmit={fetchLedger} className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label small fw-bold text-uppercase text-muted mb-1">Partner Tier</label>
              <select className="form-select border-0 bg-light shadow-sm rounded-3 py-2 fw-semibold" value={ledgerParams.party_type} onChange={e => setLedgerParams({ party_type: e.target.value, party_id: '' })}>
                <option value="ss">Super Stockist</option>
                <option value="distributor">Distributor</option>
                <option value="retailer">Retailer</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-uppercase text-muted mb-1">Select Partner</label>
              <select className="form-select border-0 bg-light shadow-sm rounded-3 py-2 fw-bold text-primary" required value={ledgerParams.party_id} onChange={e => setLedgerParams({...ledgerParams, party_id: e.target.value})}>
                <option value="" disabled>Choose an account to view...</option>
                {getActiveList(ledgerParams.party_type).map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <button type="submit" className="btn btn-primary w-100 shadow-sm rounded-3 py-2 fw-bold" disabled={!ledgerParams.party_id || loading}>
                {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <><i className="fa-solid fa-book-open me-2"></i> Load Ledger</>}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* LEDGER DISPLAY */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        <div className="card-header bg-white border-bottom-0 pt-4 pb-3 px-4 d-flex justify-content-between align-items-center">
          <h5 className="m-0 fw-bold text-dark">
            <i className="fa-solid fa-file-invoice-dollar text-secondary me-2"></i>
            Statement of Account
          </h5>
          {ledgerData.length > 0 && (
            <div className="text-end">
              <span className="small text-muted text-uppercase fw-bold me-2">Current Balance:</span>
              {/* If backend sends balance, use ledgerBalance. Otherwise, calculate dynamically if needed, or hide */}
              <span className={`fs-4 fw-bolder ${ledgerBalance > 0 ? 'text-danger' : ledgerBalance < 0 ? 'text-success' : 'text-dark'}`}>
                {formatCurrency(Math.abs(ledgerBalance))} {ledgerBalance > 0 ? ' (Dr)' : ledgerBalance < 0 ? ' (Cr)' : ''}
              </span>
            </div>
          )}
        </div>

        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Date & Time</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Ref / Txn ID</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Particulars</th>
                  <th className="text-end py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Debit (₹)</th>
                  <th className="text-end py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : !ledgerParams.party_id && ledgerData.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-5 text-muted"><i className="fa-solid fa-hand-pointer fs-2 mb-3 opacity-25 d-block"></i> Select an account above to view the ledger.</td></tr>
                ) : ledgerData.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-receipt fs-2 mb-3 opacity-25 d-block"></i> No transactions found for this account.</td></tr>
                ) : (
                  ledgerData.map((txn, idx) => {
                    // Adjust these property names based on what your FastAPI backend actually returns
                    const isCredit = txn.type === 'CREDIT' || txn.transaction_type === 'PAYMENT' || txn.amount < 0;
                    const displayAmount = Math.abs(txn.amount || txn.value || 0);

                    return (
                      <tr key={idx}>
                        <td className="px-4">
                          <div className="text-dark fw-semibold">{new Date(txn.created_at || txn.date || Date.now()).toLocaleDateString('en-IN')}</div>
                          <small className="text-muted">{new Date(txn.created_at || txn.date || Date.now()).toLocaleTimeString('en-IN')}</small>
                        </td>
                        <td>
                          <code className="bg-light text-dark px-2 py-1 rounded border">{txn.reference_number || txn.id || 'SYS-GEN'}</code>
                        </td>
                        <td>
                          <span className={`badge rounded-pill me-2 ${isCredit ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                            {txn.type || (isCredit ? 'PAYMENT RECEIVED' : 'INVOICE ISSUED')}
                          </span>
                          <span className="text-muted small">{txn.remarks || txn.description || '-'}</span>
                        </td>
                        <td className="text-end fw-bold text-danger">
                          {!isCredit ? formatCurrency(displayAmount) : '-'}
                        </td>
                        <td className="text-end fw-bold text-success">
                          {isCredit ? formatCurrency(displayAmount) : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- MODAL: RECEIVE PAYMENT --- */}
      {isPaymentModalOpen && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
              <form onSubmit={handleReceivePayment}>
                <div className="modal-header bg-success bg-gradient text-white border-0 p-4">
                  <h5 className="modal-title fw-bold"><i className="fa-solid fa-cash-register me-2"></i> Receive & Log Payment</h5>
                  <button type="button" className="btn-close btn-close-white opacity-75" onClick={() => setIsPaymentModalOpen(false)}></button>
                </div>

                <div className="modal-body p-4 bg-light bg-opacity-50">
                  <div className="row g-4">

                    {/* Select Party Type */}
                    <div className="col-md-4">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">From Tier <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2" value={paymentForm.party_type} onChange={e => setPaymentForm({...paymentForm, party_type: e.target.value, party_id: ''})}>
                        <option value="ss">Super Stockist</option>
                        <option value="distributor">Distributor</option>
                        <option value="retailer">Retailer</option>
                      </select>
                    </div>

                    {/* Select Specific Party */}
                    <div className="col-md-8">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Select Account <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2 fw-bold text-primary" required value={paymentForm.party_id} onChange={e => setPaymentForm({...paymentForm, party_id: e.target.value})}>
                        <option value="" disabled>Choose account...</option>
                        {getActiveList(paymentForm.party_type).map(p => (
                          <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>
                        ))}
                      </select>
                    </div>

                    {/* Amount */}
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Amount Received (₹) <span className="text-danger">*</span></label>
                      <div className="input-group shadow-sm rounded-3 overflow-hidden">
                        <span className="input-group-text bg-white border-0 text-success fw-bold">₹</span>
                        <input type="number" className="form-control form-control-lg border-0 bg-white shadow-none" required min="1" step="0.01" placeholder="0.00" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />
                      </div>
                    </div>

                    {/* Mode */}
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Payment Mode <span className="text-danger">*</span></label>
                      <select className="form-select border-0 shadow-sm rounded-3 py-2 h-100" required value={paymentForm.payment_mode} onChange={e => setPaymentForm({...paymentForm, payment_mode: e.target.value})}>
                        <option value="UPI">UPI (GPay, PhonePe, etc.)</option>
                        <option value="NEFT/RTGS">Bank Transfer (NEFT/RTGS/IMPS)</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="CASH">Cash</option>
                      </select>
                    </div>

                    {/* Reference Number */}
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Reference / UTR Number</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2" placeholder="e.g. UTR123456789" value={paymentForm.reference_number} onChange={e => setPaymentForm({...paymentForm, reference_number: e.target.value})} />
                    </div>

                    {/* Remarks */}
                    <div className="col-md-6">
                      <label className="form-label small fw-bold text-uppercase text-muted mb-1">Remarks</label>
                      <input type="text" className="form-control border-0 shadow-sm rounded-3 py-2" placeholder="e.g. Cleared pending invoice #42" value={paymentForm.remarks} onChange={e => setPaymentForm({...paymentForm, remarks: e.target.value})} />
                    </div>

                  </div>
                </div>

                <div className="modal-footer border-0 p-4 bg-white">
                  <button type="button" className="btn btn-light fw-semibold px-4 rounded-pill" onClick={() => setIsPaymentModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-success fw-bold px-5 rounded-pill shadow-sm">Process Payment</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}