import React, { useState, useMemo } from 'react';
import { money } from '../../shared/format.js';
import { WORLD_CONTINENTS, buildEmpireMapData } from '../../shared/world-map.js';

export default function EmpireMapView({ s, c, navigate, onBack }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'

  const data = useMemo(
    () => buildEmpireMapData(s, c, { filter, q }),
    [s.businesses, s.properties, s.propState, s.at, c, filter, q]
  );

  const selected = useMemo(
    () => data.markers.find(m => m.id === selectedId) || data.markers[0] || null,
    [data.markers, selectedId]
  );

  const vbWidth = 1000 / zoom;
  const vbHeight = 500 / zoom;
  const cx = selected ? Math.min(1000 - vbWidth / 2, Math.max(vbWidth / 2, selected.x)) : 500;
  const cy = selected ? Math.min(500 - vbHeight / 2, Math.max(vbHeight / 2, selected.y)) : 240;
  const vbX = Math.max(0, Math.min(1000 - vbWidth, cx - vbWidth / 2));
  const vbY = Math.max(0, Math.min(500 - vbHeight, cy - vbHeight / 2));

  return (
    <div className="finance-dash">
      <div className="line category-bar">
        <button className="secondary small" onClick={onBack}>← Home</button>
        <span className="eyebrow">ILLUSTRATIVE EMPIRE NETWORK MAP</span>
      </div>

      <section className="card-networth">
        <div className="line">
          <div>
            <span className="eyebrow">GLOBAL FOOTPRINT</span>
            <h2>{data.totals.locationsCount} Active Hubs · {data.totals.hqCount} HQs · {data.totals.propertyCount} Properties</h2>
          </div>
          <div className="buttons" style={{ gap: 6 }}>
            <button className={viewMode === 'map' ? 'small' : 'secondary small'} onClick={() => setViewMode('map')}>Map</button>
            <button className={viewMode === 'list' ? 'small' : 'secondary small'} onClick={() => setViewMode('list')}>List View</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Simulated coordinates for your corporate headquarters, international branches, logistics corridors, and real estate holdings.
        </p>
      </section>

      <div className="filter-bar">
        <div className="sort-pills">
          {[['all', 'All'], ['hq', 'Headquarters'], ['branches', 'Branches'], ['properties', 'Properties'], ['logistics', 'Logistics']].map(([k, lbl]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{lbl}</button>
          ))}
        </div>
        <input type="search" placeholder="Search city, country, asset…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {viewMode === 'map' ? (
        <div className="desktop-grid-2">
          <section className="map-canvas-card">
            <div className="line" style={{ marginBottom: 8 }}>
              <span className="eyebrow">VECTOR MAP ({zoom.toFixed(1)}x)</span>
              <div className="buttons" style={{ gap: 4 }}>
                <button type="button" className="secondary small" onClick={() => setZoom(z => Math.min(2.6, Number((z + 0.5).toFixed(1))))}>+</button>
                <button type="button" className="secondary small" onClick={() => setZoom(z => Math.max(1, Number((z - 0.5).toFixed(1))))}>−</button>
                <button type="button" className="secondary small" onClick={() => { setZoom(1); setSelectedId(null); }}>Reset</button>
              </div>
            </div>

            <svg
              className="empire-map-svg"
              viewBox={`${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbWidth.toFixed(1)} ${vbHeight.toFixed(1)}`}
              role="img"
              aria-label="Interactive global empire vector map"
            >
              <rect x="0" y="0" width="1000" height="500" fill="#f1f5f9" />
              {[125, 250, 375].map(y => (
                <line key={`lat-${y}`} x1="0" x2="1000" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="0.7" />
              ))}
              {[200, 400, 600, 800].map(x => (
                <line key={`lon-${x}`} x1={x} x2={x} y1="0" y2="500" stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="0.7" />
              ))}
              {WORLD_CONTINENTS.map(cont => (
                <polygon key={cont.id} points={cont.points} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
              ))}

              {/* Unexpanded regional opportunity rings */}
              {data.opportunities.map(opp => (
                <circle key={`opp-${opp.id}`} cx={opp.x} cy={opp.y} r={4 / zoom} fill="none" stroke="#94a3b8" strokeDasharray="2 2" strokeWidth={1 / zoom}>
                  <title>{opp.name} Expansion Hub ({opp.activeInCount} active branches)</title>
                </circle>
              ))}

              {/* Simulated branch / logistics network routes */}
              {data.routes.map(rt => (
                <line
                  key={rt.id}
                  x1={rt.x1}
                  y1={rt.y1}
                  x2={rt.x2}
                  y2={rt.y2}
                  stroke={rt.isLogistics ? '#0284c7' : '#2563eb'}
                  strokeWidth={1.6 / zoom}
                  strokeDasharray="4 3"
                  opacity="0.7"
                >
                  <title>{rt.businessName}: {rt.from} → {rt.to}</title>
                </line>
              ))}

              {/* Clustered empire locations */}
              {data.markers.map(m => {
                const isSel = selected?.id === m.id;
                const r = Math.min(13, 5 + m.totalCount * 0.9) / zoom;
                const fill = m.hqs.length > 0 ? '#2563eb' : m.branches.length > 0 ? '#0284c7' : '#087f5b';
                return (
                  <g key={m.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(m.id)}>
                    {isSel && <circle cx={m.x} cy={m.y} r={r * 1.7} fill={fill} opacity="0.2" />}
                    <circle cx={m.x} cy={m.y} r={r} fill={fill} stroke="#ffffff" strokeWidth={1.4 / zoom} />
                    <text
                      x={m.x}
                      y={m.y - r - 3 / zoom}
                      fontSize={9 / zoom}
                      fontWeight="700"
                      textAnchor="middle"
                      fill="#0f172a"
                    >
                      {m.country}{m.totalCount > 1 ? ` (${m.totalCount})` : ''}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="map-legend">
              <span><i style={{ background: '#2563eb' }} /> Headquarters</span>
              <span><i style={{ background: '#0284c7' }} /> Global Branch / Route</span>
              <span><i style={{ background: '#087f5b' }} /> Properties</span>
            </div>
          </section>

          <section>
            <span className="eyebrow">REGION DRILL-DOWN</span>
            {!selected ? (
              <p className="muted">No locations match this filter yet. Buy a business or real estate property to populate your global map.</p>
            ) : (
              <>
                <div className="line" style={{ marginBottom: 8 }}>
                  <div>
                    <h3>{selected.label}</h3>
                    <span className="muted" style={{ fontSize: 12 }}>{selected.country}</span>
                  </div>
                  <span className="tag">{selected.totalCount} assets</span>
                </div>
                <div className="profile-kv"><span>Regional Asset Value</span><strong>{money(selected.totalValue)}</strong></div>
                <div className="profile-kv"><span>Regional Revenue / Rent</span><strong className="green">+{money(selected.hourlyIncome)}/hr</strong></div>
                {Number(selected.hourlyExpenses) > 0 && (
                  <div className="profile-kv"><span>Operating Expenses</span><strong className="negative">-{money(selected.hourlyExpenses)}/hr</strong></div>
                )}

                {selected.hqs.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span className="eyebrow">HEADQUARTERS ({selected.hqs.length})</span>
                    {selected.hqs.map(h => (
                      <div key={h.id} className="profile-kv">
                        <span><b>{h.name}</b> <span className="muted">Lv {h.level}</span></span>
                        <button className="secondary small" onClick={() => navigate('/businesses/' + h.id)}>Manage ›</button>
                      </div>
                    ))}
                  </div>
                )}

                {selected.branches.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span className="eyebrow">GLOBAL BRANCHES ({selected.branches.length})</span>
                    {selected.branches.map((br, i) => (
                      <div key={`${br.businessId}-${i}`} className="profile-kv">
                        <span>{br.businessName} · <span className="muted">+{(br.revMult * 100 - 100).toFixed(0)}% rev</span></span>
                        <button className="secondary small" onClick={() => navigate('/businesses/' + br.businessId)}>Open ›</button>
                      </div>
                    ))}
                  </div>
                )}

                {selected.properties.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span className="eyebrow">REAL ESTATE ({selected.properties.length})</span>
                    {selected.properties.map(p => (
                      <div key={p.id} className="profile-kv">
                        <span>{p.name} ({p.qty}x · {p.occupancy}% occ)</span>
                        <strong className="green">+{money(p.netRent)}/hr</strong>
                      </div>
                    ))}
                    <button className="secondary small" style={{ marginTop: 6 }} onClick={() => navigate('/properties')}>Open Properties ›</button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      ) : (
        <section>
          <span className="eyebrow">ACCESSIBLE REGIONAL LIST ({data.markers.length})</span>
          {data.markers.length === 0 ? (
            <p className="muted">No regional assets match your current filter.</p>
          ) : data.markers.map(m => (
            <div key={m.id} className="profile-kv">
              <div>
                <strong>{m.label}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {m.hqs.length} HQ · {m.branches.length} branches · {m.properties.length} properties
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>{money(m.totalValue)}</strong>
                <div className="green" style={{ fontSize: 12 }}>+{money(m.hourlyIncome)}/hr</div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <span className="eyebrow">REGIONAL EXPANSION HUBS</span>
        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Open international branches inside your Logistics or Corporate businesses (Resources / Branches panel).</p>
        <div className="collection-grid">
          {data.opportunities.map(o => (
            <div key={o.id} className="upgrade-preview-card" style={{ padding: 10 }}>
              <div className="line">
                <strong>{o.name}</strong>
                <span className="tag">{o.activeInCount} active</span>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '4px 0' }}>{o.desc}</p>
              <div className="profile-kv">
                <span>Revenue / Expenses</span>
                <span><b className="green">+{(o.revMult * 100 - 100).toFixed(0)}%</b> / <b className="negative">+{(o.expMult * 100 - 100).toFixed(0)}%</b></span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
