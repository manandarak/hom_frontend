import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';

export default function FinanceMaster() {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);

  // --- STRICT RBAC EVALUATION ---
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const userPerms = user?.permissions || [];
  const isAdmin = roleName?.toLowerCase() === 'admin' || userPerms.includes('manage_roles');

  // Drives database modification rights
  const canManagePayments = isAdmin || userPerms.includes('manage_payments');

  // Drives UI logic (Global Dashboard vs Personal Ledger)
  const isExternalPartner = ['SuperStockist', 'Distributor', 'Retailer'].includes(roleName);
  const isInternalTeam = !isExternalPartner;

  // Safely map partner role to API party_type keys
  const getPartyTypeFromRole = () => {
      if (roleName === 'SuperStockist') return 'ss';
      if (roleName === 'Distributor') return 'distributor';
      if (roleName === 'Retailer') return 'retailer';
      return 'ss'; // Default fallback for Admin
  };
  const partnerPartyType = getPartyTypeFromRole();

  // --- MASTER DATA (For Dropdowns) ---
  const [masterData, setMasterData] = useState({
    ss: [],
    distributors: [],
    retailers: []
  });

  // --- GLOBAL SUMMARY STATE (Internal Only) ---
  const [globalSummary, setGlobalSummary] = useState(null);

  // --- LEDGER STATE ---
  const [ledgerParams, setLedgerParams] = useState({ party_type: partnerPartyType, party_id: '' });
  const [ledgerData, setLedgerData] = useState([]);
  const [ledgerBalance, setLedgerBalance] = useState(0);

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

  // --- 1. HYDRATE DATA ON MOUNT ---
  useEffect(() => {
    fetchInitialData();
  }, [user, roleName]);

  const fetchInitialData = async () => {
    try {
      // 1. Fetch Partners for dropdowns and auto-matching
      const [ssRes, distRes, retRes] = await Promise.all([
        api.get('/partners/super-stockists').catch(() => ({ data: [] })),
        api.get('/partners/distributors').catch(() => ({ data: [] })),
        api.get('/partners/retailers').catch(() => ({ data: [] }))
      ]);

      const fetchedSS = Array.isArray(ssRes.data) ? ssRes.data : ssRes.data?.items || [];
      const fetchedDistributors = Array.isArray(distRes.data) ? distRes.data : distRes.data?.items || [];
      const fetchedRetailers = Array.isArray(retRes.data) ? retRes.data : retRes.data?.items || [];

      setMasterData({
        ss: fetchedSS,
        distributors: fetchedDistributors,
        retailers: fetchedRetailers
      });

      // 2. Fetch Global Company Summary if Internal
      if (isInternalTeam) {
          fetchGlobalSummary();
      } else {
          // If External Partner, auto-find their Profile ID and strictly lock their ledger
          let myProfileList = [];
          if (roleName === 'SuperStockist') myProfileList = fetchedSS;
          else if (roleName === 'Distributor') myProfileList = fetchedDistributors;
          else if (roleName === 'Retailer') myProfileList = fetchedRetailers;

          if (myProfileList.length > 0) {
              const myProfileId = myProfileList[0].id.toString();
              setLedgerParams({ party_type: partnerPartyType, party_id: myProfileId });
          }
      }
    } catch (err) {
      console.error("Hydration failed", err);
    }
  };

  // 3. Auto-Trigger Ledger fetch for external partners once their ID is locked in
  useEffect(() => {
     if (!isInternalTeam && ledgerParams.party_id) {
         fetchLedger();
     }
  }, [ledgerParams.party_id, isInternalTeam]);

  const fetchGlobalSummary = async () => {
    try {
      const res = await api.get('/finance/summary');
      setGlobalSummary(res.data);
    } catch (err) {
      console.error("Failed to fetch global summary", err);
    }
  };

  // --- HELPERS ---
  const getActiveList = (type) => {
    if (type === 'ss' || type === 'super_stockist') return masterData.ss;
    if (type === 'distributor') return masterData.distributors;
    if (type === 'retailer') return masterData.retailers;
    return [];
  };

  const getPartnerName = (partyType, partyId) => {
    // Map backend type to frontend state key
    const typeKey = partyType === 'SuperStockist' ? 'ss' : partyType.toLowerCase();
    const list = masterData[typeKey] || [];
    const partner = list.find(p => p.id === parseInt(partyId));
    return partner ? (partner.name || partner.firm_name || partner.shop_name) : `ID: ${partyId}`;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  };

  const mapPartyType = (type) => {
    const mapping = {
      'ss': 'SuperStockist',
      'super_stockist': 'SuperStockist',
      'distributor': 'Distributor',
      'retailer': 'Retailer'
    };
    return mapping[type] || type;
  };

  // --- API CALLS ---
  const fetchLedger = async (e) => {
    if (e) e.preventDefault();
    if (!ledgerParams.party_id) return toast.error("Please select a specific partner.");

    setLoading(true);
    try {
      const backendType = mapPartyType(ledgerParams.party_type);
      const res = await api.get(`/finance/ledger/${backendType}/${ledgerParams.party_id}`);

      if (Array.isArray(res.data)) {
        setLedgerData(res.data);
        const latestBalance = res.data.length > 0 ? res.data[0].closing_balance : 0;
        setLedgerBalance(latestBalance);
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
      const payload = {
        party_type: mapPartyType(paymentForm.party_type),
        party_id: parseInt(paymentForm.party_id),
        amount: parseFloat(paymentForm.amount),
        reference_document: paymentForm.reference_number || "N/A",
        payment_mode: paymentForm.payment_mode
      };

      await api.post('/finance/payments', payload);

      toast.success('Payment received & logged successfully!', { id: toastId });
      setIsPaymentModalOpen(false);
      setPaymentForm({ party_type: 'ss', party_id: '', amount: '', payment_mode: 'UPI', reference_number: '', remarks: '' });

      // Refresh data
      fetchGlobalSummary();
      if (ledgerParams.party_type === paymentForm.party_type && ledgerParams.party_id === paymentForm.party_id) {
        fetchLedger();
      }
    } catch (err) {
      toast.error(`Transaction Failed: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  const handleClearSelection = () => {
    setLedgerParams({ party_type: 'ss', party_id: '' });
    setLedgerData([]);
  };

  // Determine which data to display in the table
  const isGlobalView = !ledgerParams.party_id && isInternalTeam;
  const tableData = isGlobalView ? (globalSummary?.recent_global_transactions || []) : ledgerData;

  return (
    <div className="container-fluid p-4" style={{ backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* HEADER */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-indian-rupee-sign text-primary me-2"></i> {isInternalTeam ? 'Finance & Accounts' : 'My Account Statement'}
          </h3>
          <p className="text-muted m-0 mt-1">
            {isInternalTeam ? 'Manage accounts receivable, global ledgers, and log payments.' : 'View your outstanding balances and transactions.'}
          </p>
        </div>

        {/* PAYMENT BUTTON - SECURED VIA PERMISSION ARRAY */}
        {canManagePayments && (
            <button className="btn btn-success shadow-sm rounded-pill px-4 fw-semibold btn-lg" onClick={() => setIsPaymentModalOpen(true)}>
              <i className="fa-solid fa-cash-register me-2"></i> Receive Payment
            </button>
        )}
      </div>

      {/* GLOBAL KPI CARDS (Internal Team Only, and only when no specific partner is selected) */}
      {isInternalTeam && isGlobalView && globalSummary && (
        <div className="row g-4 mb-4">
          <div className="col-md-3">
            <div className="card border-0 shadow-sm rounded-4 bg-primary text-white h-100">
              <div className="card-body p-4">
                <h6 className="text-uppercase fw-bold text-white-50 mb-2">Total Receivables</h6>
                <h3 className="fw-bolder mb-0">{formatCurrency(globalSummary.metrics.total_receivables)}</h3>
                <small className="text-white-50">Money owed to the company</small>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card border-0 shadow-sm rounded-4 bg-white h-100">
              <div className="card-body p-4">
                <h6 className="text-uppercase fw-bold text-muted mb-2">Super Stockists</h6>
                <h4 className="fw-bolder text-dark mb-0">{formatCurrency(globalSummary.metrics.breakdown.super_stockists)}</h4>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card border-0 shadow-sm rounded-4 bg-white h-100">
              <div className="card-body p-4">
                <h6 className="text-uppercase fw-bold text-muted mb-2">Distributors</h6>
                <h4 className="fw-bolder text-dark mb-0">{formatCurrency(globalSummary.metrics.breakdown.distributors)}</h4>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card border-0 shadow-sm rounded-4 bg-white h-100">
              <div className="card-body p-4">
                <h6 className="text-uppercase fw-bold text-muted mb-2">Retailers</h6>
                <h4 className="fw-bolder text-dark mb-0">{formatCurrency(globalSummary.metrics.breakdown.retailers)}</h4>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEDGER QUERY BAR (Internal Team Only) */}
      {isInternalTeam && (
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
                <div className="col-md-5">
                  <label className="form-label small fw-bold text-uppercase text-muted mb-1">Select Partner</label>
                  <select className="form-select border-0 bg-light shadow-sm rounded-3 py-2 fw-bold text-primary" value={ledgerParams.party_id} onChange={e => setLedgerParams({...ledgerParams, party_id: e.target.value})}>
                    <option value="">-- View Global Master Ledger --</option>
                    {getActiveList(ledgerParams.party_type).map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.firm_name || p.shop_name} (ID: {p.id})</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4 d-flex gap-2">
                  <button type="submit" className="btn btn-primary w-100 shadow-sm rounded-3 py-2 fw-bold" disabled={!ledgerParams.party_id || loading}>
                    {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <><i className="fa-solid fa-book-open me-2"></i> Load Ledger</>}
                  </button>
                  {!isGlobalView && (
                    <button type="button" className="btn btn-light border w-100 shadow-sm rounded-3 py-2 fw-bold text-muted" onClick={handleClearSelection}>
                      <i className="fa-solid fa-arrow-left me-2"></i> Back to Global
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
      )}

      {/* LEDGER DISPLAY TABLE (Universal Layout) */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
        <div className="card-header bg-white border-bottom-0 pt-4 pb-3 px-4 d-flex justify-content-between align-items-center">
          <h5 className="m-0 fw-bold text-dark">
            <i className={`fa-solid ${isGlobalView ? 'fa-globe' : 'fa-file-invoice-dollar'} text-secondary me-2`}></i>
            {isGlobalView ? 'Recent Global Transactions' : 'Statement of Account'}
          </h5>

          {/* Always show the Current Balance block for External Partners, or Internal viewing a specific partner */}
          {(!isGlobalView) && (
            <div className="text-end">
              <span className="small text-muted text-uppercase fw-bold me-2">Current Balance:</span>
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
                  {isGlobalView && <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Partner Entity</th>}
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Ref / Txn ID</th>
                  <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Particulars</th>
                  <th className="text-end py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Debit (₹)</th>
                  <th className="text-end py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isGlobalView ? "6" : "5"} className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : tableData.length === 0 ? (
                  <tr><td colSpan={isGlobalView ? "6" : "5"} className="text-center py-5 text-muted fw-bold"><i className="fa-solid fa-receipt fs-2 mb-3 opacity-25 d-block"></i> No transactions found.</td></tr>
                ) : (
                  tableData.map((txn, idx) => {
                    const isCredit = txn.credit_amount > 0;

                    return (
                      <tr key={txn.id || idx}>
                        <td className="px-4">
                          <div className="text-dark fw-semibold">{new Date(txn.created_at).toLocaleDateString('en-IN')}</div>
                          <small className="text-muted">{new Date(txn.created_at).toLocaleTimeString('en-IN')}</small>
                        </td>

                        {/* Extra column for Global View to identify the partner */}
                        {isGlobalView && (
                          <td>
                            <div className="fw-bold text-dark">{getPartnerName(txn.party_type, txn.party_id)}</div>
                            <span className="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25" style={{ fontSize: '0.65rem' }}>
                              {txn.party_type}
                            </span>
                          </td>
                        )}

                        <td>
                          <code className="bg-light text-dark px-2 py-1 rounded border">{txn.reference_document || 'SYS-GEN'}</code>
                        </td>
                        <td>
                          <span className={`badge rounded-pill me-2 ${isCredit ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                            {txn.transaction_type}
                          </span>
                          {!isGlobalView && <span className="text-muted small">Balance: {formatCurrency(txn.closing_balance)}</span>}
                          {txn.remarks && <div className="text-muted small mt-1"><i className="fa-regular fa-comment-dots me-1"></i>{txn.remarks}</div>}
                        </td>
                        <td className="text-end fw-bold text-danger">
                          {txn.debit_amount > 0 ? formatCurrency(txn.debit_amount) : '-'}
                        </td>
                        <td className="text-end fw-bold text-success">
                          {txn.credit_amount > 0 ? formatCurrency(txn.credit_amount) : '-'}
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
      {isPaymentModalOpen && canManagePayments && (
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