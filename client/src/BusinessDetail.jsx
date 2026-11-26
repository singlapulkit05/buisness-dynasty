import React, { useState, useEffect } from 'react';
import GameArt from './GameArt.jsx';
import { money } from '../../shared/format.js';
import { getBusinessModel } from '../../shared/business-models.js';
import { simulateBusiness, predictBusiness, previewUpgrade, businessValuation } from '../../shared/business-sim.js';
import { SUPPLY_CHAINS, activeContractsFor } from '../../shared/supply-chain.js';
import { WORLD_REGIONS } from '../../shared/engagement.js';

const dur = ms => {
  const n = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60].map(x => String(x).padStart(2, '0')).join(':');
};

const fmtPayback = hrs => {
  if (!hrs || !Number.isFinite(hrs) || hrs <= 0) return 'No positive payback at current settings';
  if (hrs < 1) return `${Math.round(hrs * 60)} min`;
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return `${h}h ${m}m`;
};

export default function BusinessDetail({ s, b, x, c, bizColor, onBack, act, rewardButton }) {
  const [sub, setSub] = useState('overview');
  const m = getBusinessModel(b.type);
  const [draft, setDraft] = useState(() => ({ ...b.settings }));
  const [brandName, setBrandName] = useState(b.name || x.name);
  const [brandColor, setBrandColor] = useState(b.color || bizColor);

  useEffect(() => {
    setDraft({ ...b.settings });
    setBrandName(b.name || x.name);
    setBrandColor(b.color || bizColor);
  }, [b.id]);

  const sim = simulateBusiness(s, b, s.at, c);
  const pred = predictBusiness(s, b, draft, s.at, c);
  const deltaPred = Number(pred.netProfit) - Number(sim.netProfit);
  const val = businessValuation(b, c);
  const netNum = Number(sim.netProfit);
  const predNetNum = Number(pred.netProfit);
  const hasChanges = m.controls.some(ctrl => Number(draft[ctrl.key]) !== Number(b.settings?.[ctrl.key]));

  const pts = [...(b.statsHistory || [])].reverse();
  const chartMax = Math.max(1, ...pts.map(p => Math.max(p.rev, p.exp, Math.abs(p.net))));
  const chartMin = Math.min(0, ...pts.map(p => p.net));
  const span = Math.max(1, chartMax - chartMin);
  const cx = i => pts.length > 1 ? 10 + (i / (pts.length - 1)) * 280 : 150;
  const cy = v => 10 + ((chartMax - v) / span) * 90;
  const pathFor = key => pts.map((p, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${cy(p[key]).toFixed(1)}`).join(' ');

  return (
    <div className="biz-detail">
      <div className="line category-bar">
        <button className="secondary small" onClick={onBack}>← My companies</button>
        <span className="lv-badge">Lv {b.level} · {x.kind.toUpperCase()}</span>
      </div>

      <section className="company-hero">
        <div className="biz-circle lg" style={{ background: b.color || bizColor }}><GameArt id={x.id} /></div>
        <h2>{b.name || x.name}</h2>
        <p className="muted" style={{ margin: '2px 0 8px' }}>{x.name} · {m.subtitle}</p>
        <div className="company-income-box">
          <strong className={netNum >= 0 ? 'green' : 'negative'}>{netNum >= 0 ? '+' : ''}{money(sim.netProfit)}/hr</strong>
          <span>Net hourly profit ({sim.margin.toFixed(1)}% margin)</span>
        </div>
      </section>

      <div className="detail-tabs">
        {[['overview', 'Overview'], ['manage', 'Manage'], ['upgrades', 'Upgrades'], ['resources', 'Resources'], ['analytics', 'Analytics'], ['history', 'History']].map(([k, lbl]) => (
          <button key={k} className={sub === k ? 'active' : ''} onClick={() => setSub(k)}>{lbl}</button>
        ))}
      </div>

      {sim.warnings.length > 0 && (
        <section className="warn-box">
          <span className="eyebrow">OPERATIONAL ALERTS</span>
          {sim.warnings.map((w, i) => <p key={i} className="negative">⚠ {w}</p>)}
        </section>
      )}

      {sub === 'overview' && (
        <>
          <section>
            <h3>Financial Snapshot</h3>
            <div className="profile-kv"><span>Hourly Revenue</span><strong className="green">+{money(sim.revenue)}/hr</strong></div>
            <div className="profile-kv"><span>Hourly Expenses</span><strong className="negative">-{money(sim.expenses)}/hr</strong></div>
            <div className="profile-kv"><span>Net Hourly Profit</span><strong className={netNum >= 0 ? 'green' : 'negative'}>{netNum >= 0 ? '+' : ''}{money(sim.netProfit)}/hr</strong></div>
            <div className="profile-kv"><span>Business Valuation</span><strong>{money(val)}</strong></div>
            <div className="profile-kv"><span>Lifetime Profit</span><strong>{money(b.earned || 0)}</strong></div>
            <div className="profile-kv"><span>{sim.capacityLabel}</span><strong>{Number(sim.capacityValue).toLocaleString()}</strong></div>
            {Object.entries(sim.metrics).map(([k, v]) => (
              <div key={k} className="profile-kv"><span>{k}</span><strong>{typeof v === 'number' ? money(v) : v}</strong></div>
            ))}
          </section>

          <section className={`biz-card kind-${x.kind}`}>
            <h3>Operations &amp; Boosters</h3>
            {b.job ? (
              <>
                <p>Active: <b>{b.job.kind}{b.job.key ? ` (${b.job.key})` : ''}</b> · {dur(b.job.end - s.at)}</p>
                {rewardButton('Skip time', 'jobSkip', b.id)}
              </>
            ) : (
              <p className="muted">Idle — ready for upgrades or contracts.</p>
            )}
            {rewardButton('2× revenue · 6h', 'boost', b.id, 'double')}
            {rewardButton('+10% revenue · 4h', 'boost', b.id, 'special')}
            {s.boosts.filter(q => q.target === b.id).map(q => (
              <p className="green" key={q.id}>Active {q.id}: {dur(q.end - s.at)}</p>
            ))}
            <button className="btn-danger" onClick={() => { if (confirm(`Sell ${b.name || x.name} for ${money(Number(val) * 0.7)}?`)) { act({ type: 'sellBusiness', target: b.id }); onBack(); } }}>
              Sell business · {money(Number(val) * 0.7)}
            </button>
          </section>

          <section>
            <span className="eyebrow">BUSINESS BRANDING</span>
            <h3>Name &amp; Identity</h3>
            <div className="bank-grid">
              <label>Display Name<input maxLength={32} value={brandName} onChange={e => setBrandName(e.target.value)} /></label>
              <label>Brand Color<input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} style={{ height: 42, padding: 4 }} /></label>
            </div>
            <button className="secondary" style={{ marginTop: 8 }} onClick={() => act({ type: 'brandBusiness', target: b.id, name: brandName, color: brandColor })}>Save Branding</button>
          </section>

          <section>
            <span className="eyebrow">WORLDWIDE EXPANSION</span>
            <h3>Global Branches</h3>
            <p className="muted">Open regional branches to expand demand and revenue in global hubs.</p>
            {WORLD_REGIONS.map(reg => {
              const opened = (b.branches || []).includes(reg.id);
              const cost = x.price * reg.costMult;
              return (
                <div key={reg.id} className="profile-kv" style={{ alignItems: 'center' }}>
                  <div>
                    <strong>{reg.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>+{Math.round((reg.revMult - 1) * 100)}% rev · {reg.expMult >= 1 ? '+' : ''}{Math.round((reg.expMult - 1) * 100)}% exp · {reg.desc}</div>
                  </div>
                  {opened ? <span className="badge-premium">OPEN</span> : (
                    <button className="small" disabled={Number(s.cash) < cost} onClick={() => act({ type: 'openBranch', target: b.id, region: reg.id })}>
                      Open · {money(cost)}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}

      {sub === 'manage' && (
        <>
          <section>
            <span className="eyebrow">MANAGEMENT CONTROLS</span>
            <h3>Tune Operations</h3>
            {m.controls.map(ctrl => (
              <div key={ctrl.key} className="ctrl-block">
                <div className="line">
                  <label title={ctrl.tip}><b>{ctrl.label}</b></label>
                  <strong>{draft[ctrl.key]}{ctrl.unit}</strong>
                </div>
                <input
                  type="range"
                  min={ctrl.min}
                  max={ctrl.max}
                  step={ctrl.step}
                  value={draft[ctrl.key] ?? ctrl.def}
                  onChange={e => setDraft(d => ({ ...d, [ctrl.key]: Number(e.target.value) }))}
                />
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>{ctrl.tip}</p>
              </div>
            ))}
          </section>

          <section className="pred-card">
            <span className="eyebrow">REAL-TIME FINANCIAL PREDICTION</span>
            <h3>Projected Impact</h3>
            <div className="profile-kv"><span>Estimated Revenue</span><strong className="green">+{money(pred.revenue)}/hr</strong></div>
            <div className="profile-kv"><span>Estimated Expenses</span><strong className="negative">-{money(pred.expenses)}/hr</strong></div>
            <div className="profile-kv">
              <span>Estimated Net Profit</span>
              <strong className={predNetNum >= 0 ? 'green' : 'negative'}>
                {predNetNum >= 0 ? '+' : ''}{money(pred.netProfit)}/hr
                {hasChanges && ` (${deltaPred >= 0 ? '+' : ''}${money(deltaPred)})`}
              </strong>
            </div>
            <div className="profile-kv"><span>Demand / Utilization</span><strong>{pred.demand.toFixed(0)}% / {pred.utilization.toFixed(0)}%</strong></div>
            {Object.entries(pred.metrics).map(([k, v]) => (
              <div key={k} className="profile-kv"><span>{k}</span><strong>{typeof v === 'number' ? money(v) : v}</strong></div>
            ))}
            {pred.warnings.map((w, i) => <p key={i} className="negative" style={{ margin: '6px 0 0' }}>⚠ {w}</p>)}
            <div className="buttons" style={{ marginTop: 12 }}>
              <button disabled={!hasChanges} onClick={() => act({ type: 'manageBiz', target: b.id, settings: draft })}>Apply Changes</button>
              {hasChanges && <button className="secondary" onClick={() => setDraft({ ...b.settings })}>Reset</button>}
            </div>
          </section>

          <section>
            <span className="eyebrow">SUPPLY CHAINS &amp; CONTRACTS</span>
            <h3>Intercompany Network</h3>
            {(() => {
              const allActive = activeContractsFor(s);
              const mine = allActive.filter(ct => ct.supplierId === b.id || ct.buyerId === b.id);
              const options = [];
              for (const ch of SUPPLY_CHAINS) {
                if (ch.buyers.includes(b.type) && !allActive.some(ct => ct.chainId === ch.id && ct.buyerId === b.id)) {
                  for (const partner of s.businesses.filter(p => p.id !== b.id && ch.suppliers.includes(p.type))) {
                    options.push({ key: `${ch.id}-buy-${partner.id}`, chainId: ch.id, supplierId: partner.id, buyerId: b.id, label: `Buy from ${partner.name || partner.type} (${ch.name})`, desc: ch.buyerDesc });
                  }
                }
                if (ch.suppliers.includes(b.type)) {
                  for (const partner of s.businesses.filter(p => p.id !== b.id && ch.buyers.includes(p.type) && !allActive.some(ct => ct.chainId === ch.id && ct.buyerId === p.id))) {
                    options.push({ key: `${ch.id}-sup-${partner.id}`, chainId: ch.id, supplierId: b.id, buyerId: partner.id, label: `Supply to ${partner.name || partner.type} (${ch.name})`, desc: ch.supplierDesc });
                  }
                }
              }
              return (
                <>
                  {mine.length === 0 && <p className="muted">No active supply contracts for this company.</p>}
                  {mine.map(ct => {
                    const ch = SUPPLY_CHAINS.find(k => k.id === ct.chainId);
                    const isBuyer = ct.buyerId === b.id;
                    const partner = s.businesses.find(p => p.id === (isBuyer ? ct.supplierId : ct.buyerId));
                    return (
                      <div key={ct.id} className="profile-kv" style={{ alignItems: 'center' }}>
                        <div>
                          <strong>{ch?.name || ct.chainId}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>{isBuyer ? 'From' : 'To'} {partner?.name || partner?.type} · {isBuyer ? ch?.buyerDesc : ch?.supplierDesc}</div>
                        </div>
                        <button className="secondary small" onClick={() => act({ type: 'cancelContract', target: ct.id })}>End</button>
                      </div>
                    );
                  })}
                  {options.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <span className="eyebrow">AVAILABLE PARTNERS</span>
                      {options.map(opt => (
                        <div key={opt.key} className="profile-kv" style={{ alignItems: 'center' }}>
                          <div>
                            <strong>{opt.label}</strong>
                            <div className="muted" style={{ fontSize: 12 }}>{opt.desc}</div>
                          </div>
                          <button className="small" onClick={() => act({ type: 'signContract', chainId: opt.chainId, supplierId: opt.supplierId, buyerId: opt.buyerId })}>Sign</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </section>
        </>
      )}

      {sub === 'upgrades' && (
        <>
          {m.upgrades.map(u => {
            const pv = previewUpgrade(s, b, u.key, s.at, c);
            const maxed = pv.curLv >= u.max;
            const dRev = Number(pv.after.revenue) - Number(pv.before.revenue);
            const dExp = Number(pv.after.expenses) - Number(pv.before.expenses);
            const dNet = Number(pv.deltaProfit);
            return (
              <section key={u.key} className="upgrade-preview-card">
                <div className="line">
                  <div>
                    <span className="eyebrow">UPGRADE CATEGORY</span>
                    <h3>{u.name}</h3>
                  </div>
                  <span className="lv-badge">Lv {pv.curLv} → {maxed ? 'MAX' : pv.nextLv}</span>
                </div>
                <p className="muted">{u.desc}</p>
                {!maxed && (
                  <>
                    <table className="preview-table">
                      <thead><tr><th>Parameter</th><th>Current</th><th>After</th></tr></thead>
                      <tbody>
                        <tr><td>Level</td><td>{pv.curLv}</td><td className="green">{pv.nextLv}</td></tr>
                        <tr><td>{pv.after.capacityLabel}</td><td>{Number(pv.before.capacityValue).toLocaleString()}</td><td className="green">{Number(pv.after.capacityValue).toLocaleString()}</td></tr>
                        <tr><td>Hourly Revenue</td><td>{money(pv.before.revenue)}</td><td className={dRev >= 0 ? 'green' : 'negative'}>{money(pv.after.revenue)}</td></tr>
                        <tr><td>Hourly Expenses</td><td>{money(pv.before.expenses)}</td><td className={dExp <= 0 ? 'green' : 'negative'}>{money(pv.after.expenses)}</td></tr>
                        <tr><td>Net Profit/hr</td><td>{money(pv.before.netProfit)}</td><td className={dNet >= 0 ? 'green' : 'negative'}>{money(pv.after.netProfit)}</td></tr>
                      </tbody>
                    </table>
                    <div className="upgrade-meta">
                      <span>Cost: <b>{money(pv.cost)}</b></span>
                      <span>Time: <b>{dur(pv.duration)}</b></span>
                      <span>Gain: <b className={dNet >= 0 ? 'green' : 'negative'}>{dNet >= 0 ? '+' : ''}{money(pv.deltaProfit)}/hr ({pv.pctImprove.toFixed(1)}%)</b></span>
                      <span>Payback: <b>{fmtPayback(pv.paybackHours)}</b></span>
                    </div>
                  </>
                )}
                <button disabled={maxed || !!b.job} onClick={() => act({ type: 'upgradeBiz', target: b.id, key: u.key })}>
                  {maxed ? 'Max Level Reached' : b.job ? 'Upgrade in progress…' : `Upgrade ${u.name} · ${money(pv.cost)}`}
                </button>
              </section>
            );
          })}
        </>
      )}

      {sub === 'resources' && (
        <>
          <section>
            <span className="eyebrow">WORKFORCE &amp; INFRASTRUCTURE</span>
            <h3>Resources</h3>
            {m.extra && (
              <div className="resource-row">
                <div className="profile-kv"><span>{m.extra.label}</span><strong>{b[m.extra.key] || 0} {m.extra.unit}</strong></div>
                <button className="secondary" disabled={!!b.job} onClick={() => act({ type: 'buyExtra', target: b.id, kind: m.extra.key })}>
                  Add {m.extra.label} · {money(x.price * m.extra.costPct)}
                </button>
              </div>
            )}
            {m.staff && (
              <div className="resource-row" style={{ marginTop: 12 }}>
                <div className="profile-kv"><span>{m.staff.label}</span><strong>{b.staff || 0} {m.staff.unit}</strong></div>
                <button className="secondary" disabled={!!b.job} onClick={() => act({ type: 'buyExtra', target: b.id, kind: 'staff' })}>
                  Recruit {m.staff.label} · {money(x.price * m.staff.costPct)}
                </button>
              </div>
            )}
            {['project', 'sports'].includes(x.kind) && (
              <button style={{ marginTop: 12 }} disabled={!!b.job} onClick={() => act({ type: 'project', target: b.id })}>
                {m.projectLabel || 'Start Project'} · {money(x.price * 0.2)} (5 min → +{money(x.price * 0.3)})
              </button>
            )}
          </section>

          <section className="manager-card">
            <div className="line">
              <div><span className="eyebrow">AUTOMATION</span><h3>Auto-Manager</h3></div>
              <span className={b.manager && b.manager !== 'paused' ? 'badge-premium' : 'tag'}>
                {b.manager ? (b.manager === 'paused' ? 'PAUSED' : 'ACTIVE') : 'NOT HIRED'}
              </span>
            </div>
            <p className="muted">Automatically queues upgrades or restarts projects/matches while offline.</p>
            {!b.manager ? (
              <button onClick={() => act({ type: 'hireManager', target: b.id })}>Hire Manager · {money(x.price * 1.5)}</button>
            ) : (
              <div className="sort-pills">
                <button className={b.manager === 'upgrade' ? 'active' : ''} onClick={() => act({ type: 'managerMode', target: b.id, mode: 'upgrade' })}>Auto-Upgrade</button>
                {['project', 'sports'].includes(x.kind) && (
                  <button className={b.manager === 'project' ? 'active' : ''} onClick={() => act({ type: 'managerMode', target: b.id, mode: 'project' })}>Auto-{x.kind === 'sports' ? 'Match' : 'Project'}</button>
                )}
                <button className={b.manager === 'paused' ? 'active' : ''} onClick={() => act({ type: 'managerMode', target: b.id, mode: 'paused' })}>Pause</button>
              </div>
            )}
          </section>
        </>
      )}

      {sub === 'analytics' && (
        <>
          <section>
            <span className="eyebrow">PERFORMANCE INDICATORS</span>
            <h3>Efficiency &amp; Utilization</h3>
            {[
              ['Capacity Utilization', sim.utilization, 'bar-blue'],
              ['Market Demand', sim.demand, 'bar-orange'],
              ['Operational Efficiency', sim.efficiency, 'bar-green']
            ].map(([lbl, pct, cls]) => (
              <div key={lbl} className="dist-row">
                <div className="line"><span>{lbl}</span><strong>{pct.toFixed(1)}%</strong></div>
                <div className="dist-track"><div className={`dist-fill ${cls}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
              </div>
            ))}
            <div className="profile-kv"><span>Profit Margin</span><strong className={sim.margin >= 0 ? 'green' : 'negative'}>{sim.margin.toFixed(1)}%</strong></div>
            <div className="profile-kv"><span>Hourly ROI on Valuation</span><strong>{Number(val) > 0 ? ((netNum / Number(val)) * 100).toFixed(3) : '0.000'}%/hr</strong></div>
          </section>

          <section>
            <span className="eyebrow">REVENUE / EXPENSES / PROFIT HISTORY</span>
            <h3>Financial Trend</h3>
            {pts.length < 2 ? (
              <p className="muted">Trend graph will populate as time passes and operations settle.</p>
            ) : (
              <>
                <svg className="market-chart" viewBox="0 0 300 110" role="img" aria-label="Business financial history">
                  <path d={pathFor('rev')} fill="none" stroke="#059669" strokeWidth="2" />
                  <path d={pathFor('exp')} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="4 3" />
                  <path d={pathFor('net')} fill="none" stroke="#2563eb" strokeWidth="2.2" />
                </svg>
                <div className="line muted" style={{ fontSize: 11, marginTop: 6 }}>
                  <span className="green">― Revenue</span>
                  <span className="negative">--- Expenses</span>
                  <span style={{ color: '#2563eb', fontWeight: 700 }}>― Net Profit</span>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {sub === 'history' && (
        <section>
          <span className="eyebrow">ACTIVITY LOG</span>
          <h3>Business History</h3>
          {(b.history || []).length === 0 ? (
            <p className="muted">No activity recorded for this business yet.</p>
          ) : (
            (b.history || []).map((h, i) => (
              <div key={i} className="profile-kv">
                <span><b>{h.type}</b> · {h.detail}</span>
                <span className="muted">{new Date(h.at).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
