import React, { useState, useEffect } from 'react';
import api from '../api';

export default function GeographyMaster() {
  // --- STATE: Data Storage ---
  const [data, setData] = useState({
    zones: [],
    states: [],
    regions: [],
    areas: [],
    territories: []
  });

  // --- STATE: Selection (Cascading Drill-Down) ---
  const [selection, setSelection] = useState({
    zone: null,
    state: null,
    region: null,
    area: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newItems, setNewItems] = useState({
    zone: '', state: '', region: '', area: '', territory: ''
  });

  // --- 1. INITIAL LOAD (Only fetch Zones!) ---
  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/geo/zones');
      setData(prev => ({ ...prev, zones: res.data }));
    } catch (err) {
      setError('Failed to connect to Geography API.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. LAZY LOADING SELECTION HANDLERS ---

  const selectZone = async (zone) => {
    setSelection({ zone, state: null, region: null, area: null });
    // Clear downstream data
    setData(prev => ({ ...prev, states: [], regions: [], areas: [], territories: [] }));

    try {
      // Hit the specific backend route: /zones/{zone_id}/states
      const res = await api.get(`/geo/zones/${zone.id}/states`);
      setData(prev => ({ ...prev, states: res.data }));
    } catch (err) { console.error("Error fetching states", err); }
  };

  const selectState = async (state) => {
    setSelection(prev => ({ ...prev, state, region: null, area: null }));
    setData(prev => ({ ...prev, regions: [], areas: [], territories: [] }));

    try {
      // Hit the specific backend route: /states/{state_id}/regions
      const res = await api.get(`/geo/states/${state.id}/regions`);
      setData(prev => ({ ...prev, regions: res.data }));
    } catch (err) { console.error("Error fetching regions", err); }
  };

  const selectRegion = async (region) => {
    setSelection(prev => ({ ...prev, region, area: null }));
    setData(prev => ({ ...prev, areas: [], territories: [] }));

    try {
      // Hit the specific backend route: /regions/{region_id}/areas
      const res = await api.get(`/geo/regions/${region.id}/areas`);
      setData(prev => ({ ...prev, areas: res.data }));
    } catch (err) { console.error("Error fetching areas", err); }
  };

  const selectArea = async (area) => {
    setSelection(prev => ({ ...prev, area }));
    setData(prev => ({ ...prev, territories: [] }));

    try {
      // Hit the specific backend route: /areas/{area_id}/territories
      const res = await api.get(`/geo/areas/${area.id}/territories`);
      setData(prev => ({ ...prev, territories: res.data }));
    } catch (err) { console.error("Error fetching territories", err); }
  };

  // --- 3. CREATION HANDLERS (POST Requests) ---
  const handleCreate = async (level, parentIdField, parentIdValue, payloadField) => {
    if (!newItems[level].trim()) return;

    try {
      const payload = { [payloadField]: newItems[level] };
      if (parentIdField) {
        payload[parentIdField] = parentIdValue;
      }

      // Hit the FastAPI create endpoints: /zones, /states, /regions, etc.
      let endpoint = `/geo/${level === 'territory' ? 'territories' : level + 's'}`;
      const res = await api.post(endpoint, payload);

      // Update local state instantly to show the new item
      setData(prev => ({
        ...prev,
        [level === 'territory' ? 'territories' : `${level}s`]: [
          ...prev[level === 'territory' ? 'territories' : `${level}s`],
          res.data
        ]
      }));

      setNewItems(prev => ({ ...prev, [level]: '' }));
    } catch (err) {
      alert(`Error creating ${level}: ` + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) return (
    <div className="d-flex justify-content-center align-items-center h-100">
      <div className="spinner-border text-primary" role="status"></div>
      <span className="ms-3 fw-bold text-muted">Synchronizing Master Zones...</span>
    </div>
  );

  return (
    <div className="container-fluid p-4">
      {/* HEADER ROW */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold m-0"><i className="fa-solid fa-earth-asia text-primary me-2"></i> Master Geography Configurator</h4>
          <small className="text-muted">Hierarchical lazy-loading data architecture.</small>
        </div>
        <button onClick={fetchZones} className="btn btn-sm btn-outline-secondary">
          <i className="fa-solid fa-rotate-right me-1"></i> Sync DB
        </button>
      </div>

      {error && <div className="alert alert-danger"><i className="fa-solid fa-triangle-exclamation me-2"></i> {error}</div>}

      {/* CASCADING COLUMNS GRID */}
      <div className="row g-3" style={{ height: 'calc(100vh - 220px)' }}>

        {/* 1. ZONES COLUMN */}
        <div className="col h-100">
          <div className="card h-100 border-0 shadow-sm rounded-4">
            <div className="card-header bg-dark text-white border-0 py-3">
              <h6 className="m-0 fw-bold"><i className="fa-solid fa-layer-group text-primary me-2"></i>1. Zones</h6>
            </div>
            <div className="card-body p-2 d-flex flex-column h-100">
              <div className="input-group input-group-sm mb-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="New Zone..."
                  value={newItems.zone}
                  onChange={e => setNewItems({...newItems, zone: e.target.value})}
                  onKeyDown={e => e.key === 'Enter' && handleCreate('zone', null, null, 'name')}
                />
                <button className="btn btn-primary" onClick={() => handleCreate('zone', null, null, 'name')}><i className="fa-solid fa-plus"></i></button>
              </div>
              <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                {data.zones.map(z => (
                  <button
                    key={z.id}
                    onClick={() => selectZone(z)}
                    className={`list-group-item list-group-item-action border-0 rounded-2 mb-1 d-flex justify-content-between align-items-center ${selection.zone?.id === z.id ? 'active bg-primary text-white shadow-sm' : 'bg-light text-dark'}`}
                  >
                    <span className="fw-medium">{z.name}</span>
                    <i className="fa-solid fa-chevron-right small opacity-50"></i>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2. STATES COLUMN */}
        <div className="col h-100">
          <div className={`card h-100 border-0 shadow-sm rounded-4 ${!selection.zone ? 'opacity-50' : ''}`}>
            <div className="card-header bg-dark text-white border-0 py-3">
              <h6 className="m-0 fw-bold"><i className="fa-solid fa-map text-success me-2"></i>2. States</h6>
            </div>
            <div className="card-body p-2 d-flex flex-column h-100">
              {selection.zone ? (
                <>
                  <div className="input-group input-group-sm mb-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder={`New State in ${selection.zone.name}...`}
                      value={newItems.state}
                      onChange={e => setNewItems({...newItems, state: e.target.value})}
                      onKeyDown={e => e.key === 'Enter' && handleCreate('state', 'zone_id', selection.zone.id, 'name')}
                    />
                    <button className="btn btn-success" onClick={() => handleCreate('state', 'zone_id', selection.zone.id, 'name')}><i className="fa-solid fa-plus"></i></button>
                  </div>
                  <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                    {data.states.map(s => (
                      <button
                        key={s.id}
                        onClick={() => selectState(s)}
                        className={`list-group-item list-group-item-action border-0 rounded-2 mb-1 d-flex justify-content-between align-items-center ${selection.state?.id === s.id ? 'active bg-success text-white shadow-sm' : 'bg-light text-dark'}`}
                      >
                        <span className="fw-medium">{s.name}</span>
                        <i className="fa-solid fa-chevron-right small opacity-50"></i>
                      </button>
                    ))}
                    {data.states.length === 0 && <div className="text-center text-muted small mt-4">No States in this Zone</div>}
                  </div>
                </>
              ) : (
                <div className="text-center text-muted mt-5 small"><i className="fa-solid fa-arrow-left me-2"></i>Select a Zone first</div>
              )}
            </div>
          </div>
        </div>

        {/* 3. REGIONS COLUMN */}
        <div className="col h-100">
          <div className={`card h-100 border-0 shadow-sm rounded-4 ${!selection.state ? 'opacity-50' : ''}`}>
            <div className="card-header bg-dark text-white border-0 py-3">
              <h6 className="m-0 fw-bold"><i className="fa-solid fa-map-pin text-info me-2"></i>3. Regions</h6>
            </div>
            <div className="card-body p-2 d-flex flex-column h-100">
              {selection.state ? (
                <>
                  <div className="input-group input-group-sm mb-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder={`New Region...`}
                      value={newItems.region}
                      onChange={e => setNewItems({...newItems, region: e.target.value})}
                      onKeyDown={e => e.key === 'Enter' && handleCreate('region', 'state_id', selection.state.id, 'name')}
                    />
                    <button className="btn btn-info text-white" onClick={() => handleCreate('region', 'state_id', selection.state.id, 'name')}><i className="fa-solid fa-plus"></i></button>
                  </div>
                  <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                    {data.regions.map(r => (
                      <button
                        key={r.id}
                        onClick={() => selectRegion(r)}
                        className={`list-group-item list-group-item-action border-0 rounded-2 mb-1 d-flex justify-content-between align-items-center ${selection.region?.id === r.id ? 'active bg-info text-white shadow-sm' : 'bg-light text-dark'}`}
                      >
                        <span className="fw-medium">{r.name}</span>
                        <i className="fa-solid fa-chevron-right small opacity-50"></i>
                      </button>
                    ))}
                  </div>
                </>
              ) : <div className="text-center text-muted mt-5 small"><i className="fa-solid fa-arrow-left me-2"></i>Select a State first</div>}
            </div>
          </div>
        </div>

        {/* 4. AREAS COLUMN */}
        <div className="col h-100">
          <div className={`card h-100 border-0 shadow-sm rounded-4 ${!selection.region ? 'opacity-50' : ''}`}>
            <div className="card-header bg-dark text-white border-0 py-3">
              <h6 className="m-0 fw-bold"><i className="fa-solid fa-draw-polygon text-warning me-2"></i>4. Areas</h6>
            </div>
            <div className="card-body p-2 d-flex flex-column h-100">
              {selection.region ? (
                <>
                  <div className="input-group input-group-sm mb-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder={`New Area...`}
                      value={newItems.area}
                      onChange={e => setNewItems({...newItems, area: e.target.value})}
                      onKeyDown={e => e.key === 'Enter' && handleCreate('area', 'region_id', selection.region.id, 'name')}
                    />
                    <button className="btn btn-warning text-white" onClick={() => handleCreate('area', 'region_id', selection.region.id, 'name')}><i className="fa-solid fa-plus"></i></button>
                  </div>
                  <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                    {data.areas.map(a => (
                      <button
                        key={a.id}
                        onClick={() => selectArea(a)}
                        className={`list-group-item list-group-item-action border-0 rounded-2 mb-1 d-flex justify-content-between align-items-center ${selection.area?.id === a.id ? 'active bg-warning text-white shadow-sm' : 'bg-light text-dark'}`}
                      >
                        <span className="fw-medium">{a.name}</span>
                        <i className="fa-solid fa-chevron-right small opacity-50"></i>
                      </button>
                    ))}
                  </div>
                </>
              ) : <div className="text-center text-muted mt-5 small"><i className="fa-solid fa-arrow-left me-2"></i>Select a Region first</div>}
            </div>
          </div>
        </div>

        {/* 5. TERRITORIES COLUMN */}
        <div className="col h-100">
          <div className={`card h-100 border-0 shadow-sm rounded-4 ${!selection.area ? 'opacity-50' : ''}`}>
            <div className="card-header bg-dark text-white border-0 py-3">
              <h6 className="m-0 fw-bold"><i className="fa-solid fa-location-dot text-danger me-2"></i>5. Territories</h6>
            </div>
            <div className="card-body p-2 d-flex flex-column h-100">
              {selection.area ? (
                <>
                  <div className="input-group input-group-sm mb-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder={`New Territory...`}
                      value={newItems.territory}
                      onChange={e => setNewItems({...newItems, territory: e.target.value})}
                      onKeyDown={e => e.key === 'Enter' && handleCreate('territory', 'area_id', selection.area.id, 'name')}
                    />
                    <button className="btn btn-danger text-white" onClick={() => handleCreate('territory', 'area_id', selection.area.id, 'name')}><i className="fa-solid fa-plus"></i></button>
                  </div>
                  <div className="list-group list-group-flush flex-grow-1 overflow-auto">
                    {data.territories.map(t => (
                      <button
                        key={t.id}
                        className="list-group-item list-group-item-action bg-light border-0 rounded-2 mb-1 text-dark"
                      >
                        <span className="fw-medium">{t.name}</span>
                        <div className="text-muted small">Territory ID: #{t.id}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : <div className="text-center text-muted mt-5 small"><i className="fa-solid fa-arrow-left me-2"></i>Select an Area first</div>}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}