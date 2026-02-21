import React, { useState, useEffect } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';

export default function GeographyMaster() {
  const [data, setData] = useState({ zones: [], states: [], regions: [], areas: [], territories: [] });
  const [loading, setLoading] = useState(true);

  // Track our current "depth" in the hierarchy
  const [activeLevel, setActiveLevel] = useState('zone'); // 'zone', 'state', 'region', 'area', 'territory'

  // Track selected parents
  const [selection, setSelection] = useState({ zone: null, state: null, region: null, area: null });

  // We only need one input state now, since we only view one level at a time!
  const [newItemName, setNewItemName] = useState('');

  // --- CONFIGURATION FOR LEVELS ---
  const levelConfig = {
    zone:      { title: 'Zones',       icon: 'fa-layer-group',  childLevel: 'state',     parentField: null,        dataKey: 'zones' },
    state:     { title: 'States',      icon: 'fa-map',          childLevel: 'region',    parentField: 'zone_id',   dataKey: 'states' },
    region:    { title: 'Regions',     icon: 'fa-map-pin',      childLevel: 'area',      parentField: 'state_id',  dataKey: 'regions' },
    area:      { title: 'Areas',       icon: 'fa-draw-polygon', childLevel: 'territory', parentField: 'region_id', dataKey: 'areas' },
    territory: { title: 'Territories', icon: 'fa-location-dot', childLevel: null,        parentField: 'area_id',   dataKey: 'territories' }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    setLoading(true);
    try {
      const res = await api.get('/geo/zones');
      setData(prev => ({ ...prev, zones: res.data }));
    } catch (err) {
      toast.error('Failed to connect to Geography API.');
    } finally {
      setLoading(false);
    }
  };

  // --- DRILL-DOWN HANDLER ---
  const handleSelect = async (item) => {
    const config = levelConfig[activeLevel];
    if (!config.childLevel) return; // We are at Territory (the end)

    const nextLevel = config.childLevel;
    const nextDataKey = levelConfig[nextLevel].dataKey;

    // Update selection path and clear downstream data
    setSelection(prev => ({ ...prev, [activeLevel]: item }));

    // Clear the data for the next level so we show a loading state or empty list cleanly
    setData(prev => ({ ...prev, [nextDataKey]: [] }));

    // Move UI to the next level
    setActiveLevel(nextLevel);
    setNewItemName('');

    // Fetch the children
    const toastId = toast.loading(`Loading ${levelConfig[nextLevel].title}...`);
    try {
      // e.g., /geo/zones/1/states
      const res = await api.get(`/geo/${levelConfig[activeLevel].dataKey}/${item.id}/${nextDataKey}`);
      setData(prev => ({ ...prev, [nextDataKey]: res.data }));
      toast.dismiss(toastId);
    } catch (err) {
      toast.error(`Error loading data.`, { id: toastId });
    }
  };

  // --- BREADCRUMB NAVIGATION ---
  const jumpToLevel = (level) => {
    setActiveLevel(level);
    setNewItemName('');

    // Clear downstream selections based on where we jumped
    if (level === 'zone') setSelection({ zone: null, state: null, region: null, area: null });
    if (level === 'state') setSelection(prev => ({ ...prev, state: null, region: null, area: null }));
    if (level === 'region') setSelection(prev => ({ ...prev, region: null, area: null }));
    if (level === 'area') setSelection(prev => ({ ...prev, area: null }));
  };

  // --- CREATE HANDLER ---
  const handleCreate = async () => {
    if (!newItemName.trim()) return;

    const config = levelConfig[activeLevel];
    const toastId = toast.loading(`Creating ${config.title.slice(0, -1)}...`);

    try {
      const payload = { name: newItemName };

      // If we aren't creating a zone, we need to attach the parent ID
      if (config.parentField) {
        // Find the parent level name (e.g., if active is 'state', parent is 'zone')
        const parentLevelName = Object.keys(levelConfig).find(key => levelConfig[key].childLevel === activeLevel);
        payload[config.parentField] = selection[parentLevelName].id;
      }

      const endpoint = `/geo/${config.dataKey}`;
      const res = await api.post(endpoint, payload);

      // Instantly update UI
      setData(prev => ({
        ...prev,
        [config.dataKey]: [...prev[config.dataKey], res.data]
      }));

      setNewItemName('');
      toast.success('Created successfully!', { id: toastId });
    } catch (err) {
      toast.error(`Error: ` + (err.response?.data?.detail || err.message), { id: toastId });
    }
  };

  // Determine what data to render currently
  const currentConfig = levelConfig[activeLevel];
  const currentData = data[currentConfig.dataKey];

  return (
    <div className="container-fluid p-4 d-flex justify-content-center" style={{ backgroundColor: '#f4f7f8', minHeight: '100vh' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#333', color: '#fff' } }} />

      {/* Main App Container - Max width applied for perfect 14-inch scaling */}
      <div className="w-100" style={{ maxWidth: '900px' }}>

        {/* HEADER */}
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
              <i className="fa-solid fa-earth-asia text-primary me-2"></i> Geo-Spatial Configurator
            </h3>
            <p className="text-muted m-0 mt-1">Hierarchical drill-down management.</p>
          </div>
          <button onClick={() => { jumpToLevel('zone'); fetchZones(); }} className="btn btn-white bg-white shadow-sm border text-secondary fw-semibold rounded-pill px-4">
            <i className="fa-solid fa-house me-2"></i> Reset
          </button>
        </div>

        {/* BREADCRUMB NAVIGATION CARD */}
        <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white overflow-hidden">
          <div className="card-body p-3 d-flex align-items-center flex-wrap gap-2">

            <button
              onClick={() => jumpToLevel('zone')}
              className={`btn btn-sm rounded-pill px-3 fw-bold ${activeLevel === 'zone' ? 'btn-primary shadow-sm' : 'btn-light text-muted hover-bg-light'}`}
            >
              <i className="fa-solid fa-layer-group me-2"></i> Zones
            </button>

            {selection.zone && (
              <>
                <i className="fa-solid fa-chevron-right text-muted opacity-50 small"></i>
                <button
                  onClick={() => jumpToLevel('state')}
                  className={`btn btn-sm rounded-pill px-3 fw-bold ${activeLevel === 'state' ? 'btn-primary shadow-sm' : 'btn-light text-muted hover-bg-light'}`}
                >
                  {selection.zone.name}
                </button>
              </>
            )}

            {selection.state && (
              <>
                <i className="fa-solid fa-chevron-right text-muted opacity-50 small"></i>
                <button
                  onClick={() => jumpToLevel('region')}
                  className={`btn btn-sm rounded-pill px-3 fw-bold ${activeLevel === 'region' ? 'btn-primary shadow-sm' : 'btn-light text-muted hover-bg-light'}`}
                >
                  {selection.state.name}
                </button>
              </>
            )}

            {selection.region && (
              <>
                <i className="fa-solid fa-chevron-right text-muted opacity-50 small"></i>
                <button
                  onClick={() => jumpToLevel('area')}
                  className={`btn btn-sm rounded-pill px-3 fw-bold ${activeLevel === 'area' ? 'btn-primary shadow-sm' : 'btn-light text-muted hover-bg-light'}`}
                >
                  {selection.region.name}
                </button>
              </>
            )}

            {selection.area && (
              <>
                <i className="fa-solid fa-chevron-right text-muted opacity-50 small"></i>
                <button
                  className={`btn btn-sm rounded-pill px-3 fw-bold ${activeLevel === 'territory' ? 'btn-primary shadow-sm' : 'btn-light text-muted'}`}
                >
                  {selection.area.name}
                </button>
              </>
            )}

          </div>
        </div>

        {/* LIST VIEW CARD */}
        <div className="card border-0 shadow-sm rounded-4 bg-white">
          <div className="card-header bg-white border-bottom-0 pt-4 pb-3 px-4 d-flex justify-content-between align-items-center">
            <h5 className="m-0 fw-bold text-dark">
              <i className={`fa-solid ${currentConfig.icon} text-primary me-2`}></i>
              {activeLevel === 'zone' ? 'All Zones' : `${currentConfig.title} in ${selection[Object.keys(levelConfig).find(key => levelConfig[key].childLevel === activeLevel)]?.name}`}
            </h5>
            <span className="badge bg-light text-dark border rounded-pill px-3 py-2">{currentData.length} items</span>
          </div>

          {/* Input Area */}
          <div className="px-4 pb-4">
            <div className="input-group bg-light rounded-pill p-1 border border-primary border-opacity-25 shadow-sm">
              <input
                type="text"
                className="form-control form-control-lg border-0 bg-transparent shadow-none ms-3"
                placeholder={`Add a new ${currentConfig.title.slice(0, -1)} here...`}
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <button
                className="btn btn-primary rounded-pill px-4 fw-bold"
                disabled={!newItemName.trim()}
                onClick={handleCreate}
              >
                <i className="fa-solid fa-plus me-2"></i> Add
              </button>
            </div>
          </div>

          {/* Data List */}
          <div className="card-body p-0">
            {loading && activeLevel === 'zone' ? (
               <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>
            ) : currentData.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <i className="fa-solid fa-folder-open fs-1 mb-3 opacity-25"></i>
                <h5>No {currentConfig.title} Found</h5>
                <p className="small">Use the input above to create the first one.</p>
              </div>
            ) : (
              <div className="list-group list-group-flush border-top">
                {currentData.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`list-group-item list-group-item-action border-0 py-3 px-4 d-flex justify-content-between align-items-center
                      ${idx % 2 === 0 ? 'bg-transparent' : 'bg-light bg-opacity-50'} hover-bg-light`}
                    style={{ transition: 'background-color 0.2s', cursor: currentConfig.childLevel ? 'pointer' : 'default' }}
                  >
                    <div className="d-flex align-items-center">
                      <div className="bg-primary bg-opacity-10 text-primary rounded-circle d-flex justify-content-center align-items-center me-3" style={{ width: '40px', height: '40px' }}>
                        <i className={`fa-solid ${currentConfig.icon}`}></i>
                      </div>
                      <span className="fw-semibold text-dark fs-6">{item.name}</span>
                    </div>

                    <div className="d-flex align-items-center">
                      <span className="text-muted small me-3 font-monospace">ID: {item.id}</span>
                      {currentConfig.childLevel && (
                        <div className="btn btn-sm btn-light rounded-circle text-primary border">
                           <i className="fa-solid fa-arrow-right"></i>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}