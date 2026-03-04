import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import toast, { Toaster } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';

export default function GeographyMaster() {
  const [loading, setLoading] = useState(true);

  // --- BULLETPROOF RBAC LOGIC ---
  const { user } = useContext(AuthContext);
  const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
  const isAdmin = roleName?.toLowerCase() === 'admin' || (user?.permissions || []).includes('manage_roles');
  const userPerms = user?.permissions || [];

  // Drives database modification rights (Creating nodes, Deleting nodes)
  const canManageGeography = isAdmin || userPerms.includes('manage_geography');

  // --- HIERARCHICAL DATA STORE ---
  const [dataStore, setDataStore] = useState({
    root: [],      // Holds all Zones
    zone: {},      // States mapped by Zone ID
    state: {},     // Regions mapped by State ID
    region: {},    // Areas mapped by Region ID
    area: {}       // Territories mapped by Area ID
  });

  // Tracks which folders in the tree are opened
  const [expandedNodes, setExpandedNodes] = useState({ zone: {}, state: {}, region: {}, area: {} });

  // Tracks the currently selected Node for the Right Pane Command Center
  const [activeNode, setActiveNode] = useState({ level: 'root', id: null, name: 'Global Network' });
  const [newItemName, setNewItemName] = useState('');

  // --- DYNAMIC API CONFIGURATION ---
  // Added `apiEndpoint` so the frontend knows exactly which route to hit for edits/deletes
  const config = {
    root:      { title: 'Global Map', childLevel: 'zone',      childApi: 'zones',       apiEndpoint: null,          childIdField: null,        icon: 'fa-globe',               color: 'dark' },
    zone:      { title: 'Zone',       childLevel: 'state',     childApi: 'states',      apiEndpoint: 'zones',       childIdField: 'zone_id',   icon: 'fa-earth-americas',      color: 'primary' },
    state:     { title: 'State',      childLevel: 'region',    childApi: 'regions',     apiEndpoint: 'states',      childIdField: 'state_id',  icon: 'fa-map',                 color: 'success' },
    region:    { title: 'Region',     childLevel: 'area',      childApi: 'areas',       apiEndpoint: 'regions',     childIdField: 'region_id', icon: 'fa-map-location-dot',    color: 'warning' },
    area:      { title: 'Area',       childLevel: 'territory', childApi: 'territories', apiEndpoint: 'areas',       childIdField: 'area_id',   icon: 'fa-street-view',         color: 'info' },
    territory: { title: 'Territory',  childLevel: null,        childApi: null,          apiEndpoint: 'territories', childIdField: null,        icon: 'fa-location-crosshairs', color: 'danger' }
  };

  // --- 1. INITIAL LOAD ---
  useEffect(() => {
    fetchRootZones();
  }, []);

  const fetchRootZones = async () => {
    setLoading(true);
    try {
      const res = await api.get('/geo/zones');
      const fetchedZones = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setDataStore(prev => ({ ...prev, root: fetchedZones }));
    } catch (err) {
      toast.error('Failed to connect to Geography API.');
      console.error("Zone fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- 2. LAZY LOAD CHILDREN ---
  const fetchChildren = async (level, id) => {
    const childConfig = config[level];
    if (!childConfig.childLevel) return;

    try {
      const parentApiEntity = config[level].childApi === 'states' ? 'zones' : level + 's';
      const res = await api.get(`/geo/${parentApiEntity}/${id}/${childConfig.childApi}`);
      const fetchedChildren = Array.isArray(res.data) ? res.data : res.data?.items || [];

      setDataStore(prev => ({
        ...prev,
        [level]: { ...prev[level], [id]: fetchedChildren }
      }));
    } catch (err) {
      toast.error(`Failed to load data for ${config[level].title}`);
      console.error("Child fetch error:", err);
    }
  };

  // --- 3. TREE INTERACTION HANDLERS ---
  const toggleExpand = async (e, level, id) => {
    e.stopPropagation();
    const isExpanded = expandedNodes[level][id];

    if (!isExpanded && !dataStore[level][id]) {
      await fetchChildren(level, id);
    }

    setExpandedNodes(prev => ({
      ...prev,
      [level]: { ...prev[level], [id]: !isExpanded }
    }));
  };

  const selectNode = async (level, id, name) => {
    setActiveNode({ level, id, name });
    setNewItemName('');

    if (level !== 'territory' && level !== 'root' && !dataStore[level][id]) {
      await fetchChildren(level, id);
    }
  };

  // --- 4. MUTATIONS ---
  const handleCreate = async () => {
    if (!newItemName.trim()) return;

    const currConfig = config[activeNode.level];
    const childConfig = config[currConfig.childLevel];
    const toastId = toast.loading(`Creating ${childConfig.title}...`);

    try {
      const payload = { name: newItemName };
      if (currConfig.childIdField) {
        payload[currConfig.childIdField] = activeNode.id;
      }

      const res = await api.post(`/geo/${currConfig.childApi}`, payload);
      const newItem = res.data?.item || res.data;

      if (activeNode.level === 'root') {
        setDataStore(prev => ({ ...prev, root: [...prev.root, newItem] }));
      } else {
        setDataStore(prev => ({
          ...prev,
          [activeNode.level]: {
            ...prev[activeNode.level],
            [activeNode.id]: [...(prev[activeNode.level][activeNode.id] || []), newItem]
          }
        }));
      }

      setNewItemName('');
      toast.success(`${childConfig.title} created successfully!`, { id: toastId });
    } catch (err) {
      toast.error(`Error: ${err.response?.data?.detail || err.message}`, { id: toastId });
    }
  };

  // DYNAMIC DELETE: Replaces the hardcoded Zone deletion
  const handleDeleteNode = async () => {
    if (activeNode.level === 'root') return;
    const nodeCfg = config[activeNode.level];

    if (!window.confirm(`CRITICAL: Are you sure you want to delete the "${activeNode.name}" ${nodeCfg.title}? This may orphan linked downstream nodes and break the routing logic.`)) return;

    const toastId = toast.loading(`Executing deletion of ${activeNode.name}...`);
    try {
      await api.delete(`/geo/${nodeCfg.apiEndpoint}/${activeNode.id}`);

      // Instantly wipe the node from React state without a full reload
      if (activeNode.level === 'zone') {
        setDataStore(prev => ({ ...prev, root: prev.root.filter(z => z.id !== activeNode.id) }));
      } else {
        setDataStore(prev => {
          // Identify the parent level dictionary
          const parentLevel = Object.keys(config).find(key => config[key].childLevel === activeNode.level);
          const newState = { ...prev };

          if (parentLevel && newState[parentLevel]) {
            // Iterate through the parent dictionaries and strip out the deleted ID
            Object.keys(newState[parentLevel]).forEach(parentId => {
              if (newState[parentLevel][parentId]) {
                newState[parentLevel][parentId] = newState[parentLevel][parentId].filter(n => n.id !== activeNode.id);
              }
            });
          }
          return newState;
        });
      }

      // Reset view to Global Network
      setActiveNode({ level: 'root', id: null, name: 'Global Network' });
      toast.success(`${nodeCfg.title} permanently deleted.`, { id: toastId });
    } catch (err) {
      toast.error(`Deletion failed: ${err.response?.data?.detail || err.response?.statusText || err.message}`, { id: toastId });
    }
  };

  // --- DYNAMIC DATA FOR RIGHT PANE ---
  const getRightPaneData = () => {
    if (activeNode.level === 'root') return dataStore.root;
    if (activeNode.level === 'territory') return [];
    return dataStore[activeNode.level][activeNode.id] || [];
  };

  const activeData = getRightPaneData();
  const activeCfg = config[activeNode.level];
  const targetChildCfg = activeCfg.childLevel ? config[activeCfg.childLevel] : null;

  // --- RECURSIVE TREE COMPONENT ---
  const TreeNode = ({ level, item, depth = 0 }) => {
    const isExpanded = expandedNodes[level] && expandedNodes[level][item.id];
    const isSelected = activeNode.level === level && activeNode.id === item.id;
    const nodeConfig = config[level];
    const hasChildren = level !== 'territory';

    return (
      <div className="w-100">
        <div
          className={`d-flex align-items-center py-2 px-3 border-bottom border-light cursor-pointer ${isSelected ? `bg-${nodeConfig.color} bg-opacity-10 fw-bold border-start border-4 border-${nodeConfig.color}` : 'hover-bg-light'}`}
          style={{ paddingLeft: `${depth * 20 + 15}px !important`, transition: 'all 0.1s ease', cursor: 'pointer' }}
          onClick={() => selectNode(level, item.id, item.name)}
        >
          <div style={{ width: '24px' }} className="text-center me-1" onClick={(e) => hasChildren && toggleExpand(e, level, item.id)}>
            {hasChildren ? (
              <i className={`fa-solid fa-chevron-${isExpanded ? 'down' : 'right'} small text-muted hover-text-dark`} style={{ cursor: 'pointer' }}></i>
            ) : <span style={{ width: '14px', display: 'inline-block' }}></span>}
          </div>
          <i className={`fa-solid ${nodeConfig.icon} text-${nodeConfig.color} me-2 opacity-75`}></i>
          <span className={`text-truncate text-dark ${isSelected ? 'text-primary' : ''}`} style={{ fontSize: '0.9rem' }}>{item.name}</span>
        </div>

        {isExpanded && hasChildren && dataStore[level][item.id] && (
          <div className="tree-children">
            {dataStore[level][item.id].map(child => (
              <TreeNode key={child.id} level={nodeConfig.childLevel} item={child} depth={depth + 1} />
            ))}
            {dataStore[level][item.id].length === 0 && (
               <div className="text-muted small py-1 fst-italic" style={{ paddingLeft: `${(depth + 1) * 20 + 45}px` }}>No {config[nodeConfig.childLevel].title}s mapped.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container-fluid p-4 d-flex flex-column" style={{ height: '100vh', overflow: 'hidden', backgroundColor: '#f4f7f8' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: '10px', background: '#0f172a', color: '#fff', fontWeight: 'bold' } }} />

      {/* HEADER */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-shrink-0">
        <div>
          <h3 className="fw-bolder m-0 text-dark" style={{ letterSpacing: '-0.5px' }}>
            <i className="fa-solid fa-map-location-dot text-primary me-2"></i> Geo-Spatial Configurator
          </h3>
          <p className="text-muted m-0 mt-1">AWS-style master/detail control center.</p>
        </div>
      </div>

      {/* SPLIT PANE LAYOUT */}
      <div className="row g-4 flex-grow-1 overflow-hidden pb-4">

        {/* LEFT PANE: EXPLORER TREE */}
        <div className="col-lg-4 col-xl-3 h-100">
          <div className="card border-0 shadow-sm rounded-4 h-100 bg-white d-flex flex-column">
            <div className="card-header bg-dark text-white border-0 py-3 px-4 d-flex justify-content-between align-items-center">
              <h6 className="m-0 fw-bold"><i className="fa-solid fa-folder-tree me-2"></i> Network Explorer</h6>
              <button className="btn btn-sm btn-outline-light border-0" onClick={() => selectNode('root', null, 'Global Network')} title="Go to Root">
                 <i className="fa-solid fa-house"></i>
              </button>
            </div>

            <div className="card-body p-0 overflow-auto custom-scrollbar">
              {loading && dataStore.root.length === 0 ? (
                <div className="text-center py-5"><div className="spinner-border text-primary spinner-border-sm"></div></div>
              ) : (
                <div className="py-2">
                  <div
                    className={`d-flex align-items-center py-2 px-4 border-bottom border-light cursor-pointer ${activeNode.level === 'root' ? 'bg-dark bg-opacity-10 fw-bold border-start border-4 border-dark' : 'hover-bg-light'}`}
                    onClick={() => selectNode('root', null, 'Global Network')}
                    style={{ cursor: 'pointer' }}
                  >
                    <i className="fa-solid fa-globe text-dark me-2 opacity-75"></i>
                    <span className="text-dark" style={{ fontSize: '0.9rem' }}>Global Network</span>
                  </div>
                  {dataStore.root.map(zone => (
                    <TreeNode key={zone.id} level="zone" item={zone} depth={0} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: COMMAND CENTER */}
        <div className="col-lg-8 col-xl-9 h-100">
          <div className="card border-0 shadow-sm rounded-4 h-100 bg-white d-flex flex-column">

            {/* Command Center Header */}
            <div className={`card-header bg-${activeCfg.color} bg-opacity-10 border-bottom border-${activeCfg.color} border-opacity-25 pt-4 pb-3 px-4 d-flex justify-content-between align-items-center`}>
              <div>
                <span className={`badge bg-${activeCfg.color} text-white rounded-pill px-3 py-1 mb-2 shadow-sm`}>
                  <i className={`fa-solid ${activeCfg.icon} me-1`}></i> {activeCfg.title} Level
                </span>
                <h4 className="m-0 fw-bold text-dark d-flex align-items-center">
                  {activeNode.name}
                  {activeNode.id && <span className="ms-2 small font-monospace text-muted opacity-50 fs-6">ID: #{activeNode.id}</span>}
                </h4>
              </div>

              {/* SECURED: DYNAMIC DELETE FOR ALL NODES (Except Root) */}
              {activeNode.level !== 'root' && canManageGeography && (
                <button className="btn btn-outline-danger bg-white shadow-sm rounded-pill px-4 fw-bold" onClick={handleDeleteNode}>
                  <i className="fa-regular fa-trash-can me-2"></i> Delete {activeCfg.title}
                </button>
              )}
            </div>

            {/* SECURED: Input Form Area */}
            {targetChildCfg && canManageGeography && (
              <div className="px-4 py-3 bg-light border-bottom">
                <label className="form-label small fw-bold text-uppercase text-muted mb-1">
                  Add New {targetChildCfg.title} to {activeNode.name}
                </label>
                <div className={`input-group bg-white rounded-pill p-1 border border-${targetChildCfg.color} shadow-sm`}>
                  <input
                    type="text"
                    className="form-control border-0 bg-transparent shadow-none ms-3 fw-semibold"
                    placeholder={`Enter ${targetChildCfg.title.toLowerCase()} name...`}
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                  <button
                    className={`btn btn-${targetChildCfg.color} rounded-pill px-4 fw-bold text-white shadow-sm`}
                    disabled={!newItemName.trim()}
                    onClick={handleCreate}
                  >
                    <i className="fa-solid fa-plus me-2"></i> Create Node
                  </button>
                </div>
              </div>
            )}

            {/* Content Data Table */}
            <div className="card-body p-0 overflow-auto custom-scrollbar flex-grow-1">
              {!targetChildCfg ? (
                 <div className="text-center py-5 text-muted mt-5">
                   <i className={`fa-solid ${activeCfg.icon} fs-1 mb-3 text-${activeCfg.color} opacity-25`}></i>
                   <h5 className="fw-bold">Terminal Node Reached</h5>
                   <p className="small">Territories represent the finest level of granularity. No further subdivisions possible.</p>
                 </div>
              ) : activeData.length === 0 ? (
                 <div className="text-center py-5 text-muted mt-4">
                   <i className="fa-solid fa-diagram-project fs-1 mb-3 opacity-25"></i>
                   <h5 className="fw-bold">No Mapped {targetChildCfg.title}s</h5>
                   <p className="small">Use the input above to begin populating this sector.</p>
                 </div>
              ) : (
                <table className="table table-hover align-middle m-0">
                  <thead className="bg-white sticky-top shadow-sm z-1">
                    <tr>
                      <th className="px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Node Info</th>
                      <th className="py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Hierarchy Mapping</th>
                      <th className="text-end px-4 py-3 text-uppercase text-muted fw-bold border-0" style={{ fontSize: '0.75rem' }}>Explore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.map((item, idx) => (
                      <tr key={item.id} className={idx % 2 === 0 ? 'bg-transparent' : 'bg-light bg-opacity-50'}>
                        <td className="px-4 py-3">
                          <div className="d-flex align-items-center">
                            <div className={`bg-${targetChildCfg.color} bg-opacity-10 text-${targetChildCfg.color} rounded-circle d-flex justify-content-center align-items-center me-3`} style={{ width: '40px', height: '40px' }}>
                              <i className={`fa-solid ${targetChildCfg.icon}`}></i>
                            </div>
                            <div>
                              <div className="fw-bolder text-dark fs-6">{item.name}</div>
                              <div className="small text-muted font-monospace opacity-75">ID: #{item.id}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge bg-secondary bg-opacity-10 text-dark border rounded-pill px-3 py-1">
                            {targetChildCfg.title}
                          </span>
                        </td>
                        <td className="text-end px-4">
                          <button
                            className={`btn btn-sm btn-outline-${targetChildCfg.color} rounded-pill px-3 fw-bold`}
                            onClick={() => selectNode(targetChildCfg.title.toLowerCase(), item.id, item.name)}
                          >
                            Drill Down <i className="fa-solid fa-arrow-right ms-1"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}