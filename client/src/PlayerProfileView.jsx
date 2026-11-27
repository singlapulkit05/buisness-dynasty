import React, { useState, useEffect } from 'react';
import GameArt from './GameArt.jsx';
import ShowroomView from './ShowroomView.jsx';
import { money } from '../../shared/format.js';
import { api } from './storage.js';

const TABS = [
  ['overview', 'Overview'],
  ['businesses', 'Businesses'],
  ['investments', 'Investments'],
  ['properties', 'Properties'],
  ['assets', 'Luxury Assets'],
  ['research', 'Research'],
  ['achievements', 'Achievements'],
  ['auctions', 'Auctions']
];

export default function PlayerProfileView({ username, c, online, navigate, onBack }) {
  const [tab, setTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [bizData, setBizData] = useState(null);
  const [bizDetail, setBizDetail] = useState(null);
  const [invData, setInvData] = useState(null);
  const [propData, setPropData] = useState(null);
  const [propCountry, setPropCountry] = useState('all');
  const [assetData, setAssetData] = useState(null);
  const [assetCat, setAssetCat] = useState('all');
  const [assetSort, setAssetSort] = useState('price_desc');
  const [showroomMode, setShowroomMode] = useState(false);
  const [showroomVehicles, setShowroomVehicles] = useState([]);
  const [resData, setResData] = useState(null);
  const [achData, setAchData] = useState(null);
  const [aucData, setAucData] = useState(null);

  const encUser = encodeURIComponent(username);

  useEffect(() => {
    setBizDetail(null);
    setShowroomMode(false);
    if (!online) {
      setLoading(false);
      setErr('Connect to the internet to view public player profiles.');
      return;
    }
    let alive = true;
    setLoading(true);
    setErr('');
    api(`/players/${encUser}/profile`)
      .then(d => { if (alive) setProfile(d); })
      .catch(e => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [username, online]);

  useEffect(() => {
    if (!online || !profile) return;
    if (tab === 'businesses') api(`/players/${encUser}/businesses`).then(setBizData).catch(() => {});
    else if (tab === 'investments') api(`/players/${encUser}/investments`).then(setInvData).catch(() => {});
    else if (tab === 'properties') api(`/players/${encUser}/properties?country=${encodeURIComponent(propCountry)}`).then(setPropData).catch(() => {});
    else if (tab === 'assets') api(`/players/${encUser}/assets?category=${encodeURIComponent(assetCat)}&sort=${assetSort}&limit=24`).then(setAssetData).catch(() => {});
    else if (tab === 'research') api(`/players/${encUser}/research`).then(setResData).catch(() => {});
    else if (tab === 'achievements') api(`/players/${encUser}/achievements`).then(setAchData).catch(() => {});
    else if (tab === 'auctions') api(`/players/${encUser}/auctions`).then(setAucData).catch(() => {});
  }, [tab, profile?.username, propCountry, assetCat, assetSort, online]);

  async function openShowroom() {
    setShowroomMode(true);
    try {
      const [cars, aircraft, yachts] = await Promise.all([
        api(`/players/${encUser}/assets?category=cars&limit=24`),
        api(`/players/${encUser}/assets?category=aircraft&limit=24`),
        api(`/players/${encUser}/assets?category=yachts&limit=24`)
      ]);
      setShowroomVehicles([...(cars.items || []), ...(aircraft.items || []), ...(yachts.items || [])]);
    } catch {
      setShowroomVehicles(assetData?.items || []);
    }
  }

  return (
    <div className="finance-dash">
      <div className="line category-bar">
        <button className="secondary small" onClick={() => bizDetail ? setBizDetail(null) : showroomMode ? setShowroomMode(false) : onBack()}>
          ← {bizDetail ? 'All Businesses' : showroomMode ? 'Luxury Assets' : 'Back'}
        </button>
        <span className="eyebrow">PUBLIC EMPIRE PROFILE</span>
      </div>

      {loading && <section><p className="muted">Loading empire profile…</p></section>}
      {err && <section><p className="negative">{err}</p></section>}

      {profile && (
        <>
          <section className="profile-hero">
            <div className="line">
              <div className="art-heading">
                <div className="admin-avatar">{profile.username[0].toUpperCase()}</div>
                <div>
                  <span className="eyebrow">{profile.rank?.current || 'Empire'}</span>
                  <h2>{profile.username}</h2>
                </div>
              </div>
              <span className={profile.premium ? 'badge-premium' : 'badge-free'}>
                {profile.premium ? '◆ VIP' : 'PLAYER'}
              </span>
            </div>
            {profile.rank && (
              <div style={{ marginTop: 10 }}>
                <div className="line muted" style={{ fontSize: 12 }}>
                  <span>{profile.rank.next ? `Next: ${profile.rank.next}` : 'Highest Rank Reached'}</span>
                  <span>{profile.rank.pct}%</span>
                </div>
                <progress max={100} value={profile.rank.pct} />
              </div>
            )}
            {profile.snapshotAt && (
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                Last validated snapshot: {new Date(profile.snapshotAt).toLocaleString()}
              </p>
            )}
          </section>

          <div className="detail-tabs">
            {TABS.map(([k, lbl]) => (
              <button key={k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setBizDetail(null); setShowroomMode(false); }}>
                {lbl}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <>
              <div className="desktop-grid-2">
                <section className="card-networth">
                  <span className="eyebrow">EMPIRE METRICS</span>
                  {profile.overview.netWorth !== null ? (
                    <>
                      <h2>{money(profile.overview.netWorth)}</h2>
                      <div className="profile-kv"><span>Hourly Profit</span><strong className="green">+{money(profile.overview.hourlyProfit || 0)}/hr</strong></div>
                      <div className="profile-kv"><span>Investments Value</span><strong>{money(profile.overview.investVal || 0)}</strong></div>
                    </>
                  ) : (
                    <p className="muted">Detailed financial totals hidden by player privacy settings.</p>
                  )}
                  <div className="profile-kv"><span>Businesses / Branches</span><strong>{profile.overview.businessesCount ?? 'Hidden'} / {profile.overview.branchesCount ?? '—'}</strong></div>
                  <div className="profile-kv"><span>Properties / Luxury</span><strong>{profile.overview.propertiesCount ?? 'Hidden'} / {profile.overview.luxuryCount ?? 'Hidden'}</strong></div>
                  <div className="profile-kv"><span>Research / Achievements</span><strong>{profile.overview.researchDone ?? '—'}/{profile.overview.researchTotal} · {profile.overview.achievementsDone ?? '—'}/{profile.overview.achievementsTotal}</strong></div>
                </section>

                <section>
                  <span className="eyebrow">TOP BUSINESSES</span>
                  {profile.featured.topBusinesses.length === 0 ? (
                    <p className="muted">No visible businesses.</p>
                  ) : profile.featured.topBusinesses.map(b => (
                    <div key={b.id} className="profile-kv">
                      <span><b>{b.name}</b> <span className="muted">Lv {b.level} · Inf {b.infra} · Eff {b.efficiency}</span></span>
                      {b.val && <strong>{money(b.val)}</strong>}
                    </div>
                  ))}
                  {profile.featured.topAssets.length > 0 && (
                    <>
                      <span className="eyebrow" style={{ display: 'block', marginTop: 12 }}>HIGHLIGHTED COLLECTIBLES</span>
                      {profile.featured.topAssets.map(a => (
                        <div key={a.id} className="profile-kv">
                          <span>{a.name}</span>
                          <strong>{money(a.price)}</strong>
                        </div>
                      ))}
                    </>
                  )}
                </section>
              </div>
            </>
          )}

          {tab === 'businesses' && (
            bizData?.hidden ? <section><p className="muted">Businesses hidden by privacy settings.</p></section> :
            bizDetail ? (
              <section>
                <span className="eyebrow">{bizDetail.catalogueName} · READ-ONLY</span>
                <h3>{bizDetail.name}</h3>
                <div className="profile-kv"><span>Manager Status</span><strong>{bizDetail.managerStatus}</strong></div>
                {bizDetail.upgrades.map(u => (
                  <div key={u.key} className="profile-kv"><span>{u.name}</span><strong>Lv {u.level}</strong></div>
                ))}
                {bizDetail.resources.map((r, i) => (
                  <div key={i} className="profile-kv"><span>{r.label}</span><strong>{r.count}</strong></div>
                ))}
                <div className="profile-kv"><span>Global Branches</span><strong>{bizDetail.branches.length ? bizDetail.branches.join(', ') : 'None'}</strong></div>
                {bizDetail.supplyContractsSummary.length > 0 && (
                  <div className="profile-kv"><span>Supply Chains</span><strong>{bizDetail.supplyContractsSummary.map(s => `${s.role}: ${s.chain}`).join(', ')}</strong></div>
                )}
                {bizDetail.financials && (
                  <>
                    <div className="profile-kv"><span>Valuation</span><strong>{money(bizDetail.financials.valuation)}</strong></div>
                    <div className="profile-kv"><span>Revenue / Expenses</span><span><b className="green">+{money(bizDetail.financials.revenue)}</b> / <b className="negative">-{money(bizDetail.financials.expenses)}</b></span></div>
                    <div className="profile-kv"><span>Net Hourly Profit</span><strong className={Number(bizDetail.financials.netProfit) >= 0 ? 'green' : 'negative'}>{money(bizDetail.financials.netProfit)}/hr</strong></div>
                  </>
                )}
              </section>
            ) : (
              <div className="company-list">
                {(bizData?.items || []).map(b => (
                  <button key={b.id} className="company-row" onClick={() => api(`/players/${encUser}/businesses/${b.id}`).then(setBizDetail)}>
                    <div>
                      <h3>{b.name}</h3>
                      <p className="muted">{b.catalogueName} · Lv {b.level} · {b.upgrades.map(u => `${u.name}: ${u.level}`).join(' · ')}</p>
                      {b.netProfit && <strong className={Number(b.netProfit) >= 0 ? 'green' : 'negative'}>{money(b.netProfit)}/hr</strong>}
                    </div>
                    <span className="chevron">›</span>
                  </button>
                ))}
              </div>
            )
          )}

          {tab === 'investments' && (
            invData?.hidden ? <section><p className="muted">Investments hidden by privacy settings.</p></section> : (
              <div className="desktop-grid-2">
                <section>
                  <span className="eyebrow">STOCKS &amp; CORPORATE STAKES ({invData?.stocks?.length || 0})</span>
                  {(invData?.stocks || []).map(s => (
                    <div key={s.id} className="profile-kv">
                      <div>
                        <strong>{s.name}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>{s.milestone} ({s.stakePct}%)</div>
                      </div>
                      <strong>{s.value ? money(s.value) : `${s.stakePct}%`}</strong>
                    </div>
                  ))}
                </section>
                <section>
                  <span className="eyebrow">CRYPTOCURRENCY ({invData?.crypto?.length || 0})</span>
                  {(invData?.crypto || []).map(cr => (
                    <div key={cr.id} className="profile-kv">
                      <strong>{cr.name}</strong>
                      <strong>{cr.value ? `${cr.qty} units (${money(cr.value)})` : money(cr.currentPrice)}</strong>
                    </div>
                  ))}
                </section>
              </div>
            )
          )}

          {tab === 'properties' && (
            propData?.hidden ? <section><p className="muted">Properties hidden by privacy settings.</p></section> : (
              <>
                <div className="sort-pills" style={{ marginBottom: 10 }}>
                  <button className={propCountry === 'all' ? 'active' : ''} onClick={() => setPropCountry('all')}>All Locations</button>
                  {(propData?.countries || []).map(cnt => (
                    <button key={cnt} className={propCountry === cnt ? 'active' : ''} onClick={() => setPropCountry(cnt)}>{cnt}</button>
                  ))}
                </div>
                <div className="collection-grid">
                  {(propData?.items || []).map(p => (
                    <section key={p.id} className="realestate-card">
                      <div className="re-footer">
                        <div>
                          <strong className="re-price">{money(p.cataloguePrice)}</strong>
                          <div className="re-loc">{p.name} ({p.qty}x)</div>
                          {p.netRent && <div className="green re-rent">+{money(p.netRent)}/hr · {p.occupancy}% occ · {p.condition}% cond</div>}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )
          )}

          {tab === 'assets' && (
            assetData?.hidden ? <section><p className="muted">Luxury collection hidden by privacy settings.</p></section> :
            showroomMode && c ? (
              <ShowroomView
                c={c}
                readOnly
                ownerName={profile.username}
                storage={assetData?.storage}
                ownedMap={Object.fromEntries((showroomVehicles.length ? showroomVehicles : (assetData?.items || [])).map(i => [i.id, 1]))}
                lockedAssets={(showroomVehicles.length ? showroomVehicles : (assetData?.items || [])).filter(i => i.inAuction).map(i => i.id)}
                onBack={() => setShowroomMode(false)}
              />
            ) : (
              <>
                <div className="line" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div className="sort-pills">
                    <button className={assetCat === 'all' ? 'active' : ''} onClick={() => setAssetCat('all')}>All ({assetData?.total || 0})</button>
                    {(assetData?.categories || []).map(ct => (
                      <button key={ct.category} className={assetCat === ct.category ? 'active' : ''} onClick={() => setAssetCat(ct.category)}>
                        {ct.category} ({ct.owned}/{ct.total})
                      </button>
                    ))}
                  </div>
                  {c && <button className="small" onClick={openShowroom}>Visit Garage / Hangar / Marina</button>}
                </div>
                <div className="collection-grid">
                  {(assetData?.items || []).map(a => (
                    <section key={a.id} className="garage-card">
                      <div className="garage-media"><GameArt id={a.id} item={a} wide />{a.inAuction && <span className="media-pill owned">In Auction</span>}</div>
                      <div className="garage-body"><h3>{a.name}</h3><p className="garage-tier">Catalogue: {money(a.cataloguePrice)}</p></div>
                    </section>
                  ))}
                </div>
              </>
            )
          )}

          {tab === 'research' && (
            resData?.hidden ? <section><p className="muted">Research hidden by privacy settings.</p></section> : (
              <section>
                <span className="eyebrow">R&amp;D PROGRESS ({resData?.completedCount || 0} / {resData?.totalCount || 6})</span>
                {(resData?.nodes || []).map(n => (
                  <div key={n.id} className="profile-kv">
                    <div><strong>{n.name}</strong><div className="muted" style={{ fontSize: 12 }}>{n.desc}</div></div>
                    <span className={n.status === 'completed' ? 'badge-premium' : 'tag'}>{n.status.toUpperCase()}</span>
                  </div>
                ))}
              </section>
            )
          )}

          {tab === 'achievements' && (
            achData?.hidden ? <section><p className="muted">Achievements hidden by privacy settings.</p></section> : (
              <section>
                <span className="eyebrow">ACHIEVEMENTS</span>
                {(achData?.items || []).map(a => (
                  <div key={a.id} className="profile-kv">
                    <div><strong>{a.title}</strong><div className="muted" style={{ fontSize: 12 }}>{a.desc}</div></div>
                    <span className={a.unlocked ? 'badge-premium' : 'tag'}>{a.unlocked ? 'UNLOCKED' : (a.progressPct !== null ? `${a.progressPct}%` : 'LOCKED')}</span>
                  </div>
                ))}
              </section>
            )
          )}

          {tab === 'auctions' && (
            <section>
              <span className="eyebrow">SELLER AUCTIONS ({aucData?.length || 0})</span>
              {(aucData || []).length === 0 ? <p className="muted">No active or recent public auctions.</p> : aucData.map(a => (
                <div key={a._id} className="profile-kv" style={{ cursor: navigate ? 'pointer' : 'default' }} onClick={() => navigate && navigate('/auctions/' + a._id)}>
                  <div><strong>{a.assetName}</strong><div className="muted" style={{ fontSize: 12 }}>{a.status.toUpperCase()} · {a.bidCount} bids</div></div>
                  <strong className="green">{money(a.highestBidAmount || a.startingBid)} ›</strong>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
