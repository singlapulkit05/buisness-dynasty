import React, { useState, useEffect, useRef } from 'react';
import GameArt from './GameArt.jsx';
import { money } from '../../shared/format.js';
import './showroom.css';

const CATS = [
  { id: 'cars', label: 'Garage (Cars)', storageKey: 'garage', storageCost: 15000, add: 2, unit: 'spaces', sceneClass: 'scene-cars' },
  { id: 'aircraft', label: 'Hangar (Aircraft)', storageKey: 'hangar', storageCost: 250000, add: 1, unit: 'slots', sceneClass: 'scene-aircraft' },
  { id: 'yachts', label: 'Marina (Yachts)', storageKey: 'marina', storageCost: 500000, add: 1, unit: 'berths', sceneClass: 'scene-yachts' }
];

export default function ShowroomView({
  c,
  ownedMap = {},
  lockedAssets = [],
  storage = null,
  readOnly = false,
  ownerName = null,
  initialCategory = 'cars',
  act,
  online = true,
  onStartAuction,
  onBrowseCatalogue,
  onBack
}) {
  const [catId, setCatId] = useState(CATS.some(x => x.id === initialCategory) ? initialCategory : 'cars');
  const [viewMode, setViewMode] = useState('showroom');
  const [selectedId, setSelectedId] = useState(null);
  const [slideDir, setSlideDir] = useState('init');
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('price_desc');
  const [lightbox, setLightbox] = useState(false);

  const touchStart = useRef(null);
  const meta = CATS.find(x => x.id === catId) || CATS[0];

  // Owned items strictly derived from ownedMap; includes retro in garage
  const ownedItems = c.assets.filter(x => {
    const isCat = x.category === catId || (catId === 'cars' && (x.category === 'retro' || x.id === 'car' || x.id === 'retro'));
    return isCat && (ownedMap[x.id] || 0) > 0;
  });

  const filteredItems = [...ownedItems]
    .filter(x => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'price_asc' ? a.price - b.price : b.price - a.price);

  const curIndex = Math.max(0, ownedItems.findIndex(x => x.id === selectedId));
  const selected = ownedItems[curIndex] || ownedItems[0] || null;
  const totalValue = ownedItems.reduce((sum, x) => sum + Number(x.price || 0), 0);

  // Reconcile selection when owned list changes (sell, auction settlement, category switch)
  useEffect(() => {
    if (!ownedItems.length) {
      setSelectedId(null);
    } else if (!selectedId || !ownedItems.some(x => x.id === selectedId)) {
      setSlideDir('init');
      setSelectedId(ownedItems[0].id);
    }
  }, [catId, ownedItems.length, selected?.id]);

  function step(dir) {
    if (ownedItems.length <= 1) return;
    setSlideDir(dir > 0 ? 'next' : 'prev');
    const nextIdx = (curIndex + dir + ownedItems.length) % ownedItems.length;
    setSelectedId(ownedItems[nextIdx].id);
  }

  useEffect(() => {
    if (viewMode !== 'showroom' || ownedItems.length <= 1) return;
    const onKey = e => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape' && lightbox) setLightbox(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMode, curIndex, ownedItems.length, lightbox]);

  const cap = storage?.[meta.storageKey] ?? null;
  const isLocked = selected ? lockedAssets.includes(selected.id) : false;

  return (
    <div className="finance-dash">
      <div className="showroom-header">
        <div className="line">
          <div>
            {onBack && <button className="secondary small" style={{ marginBottom: 6 }} onClick={onBack}>← Back</button>}
            <span className="eyebrow">{readOnly ? `${ownerName}'S SHOWROOM` : 'PRIVATE SHOWROOM'}</span>
            <h2 style={{ margin: '2px 0' }}>{meta.label}</h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong className="green" style={{ fontSize: 18 }}>{money(totalValue)}</strong>
            <div className="muted">{ownedItems.length} owned{cap !== null ? ` · ${ownedItems.length}/${cap} ${meta.unit}` : ''}</div>
          </div>
        </div>

        <div className="showroom-tabs">
          {CATS.map(ct => (
            <button key={ct.id} className={catId === ct.id ? '' : 'secondary'} onClick={() => { setCatId(ct.id); setSlideDir('init'); setSelectedId(null); }}>
              {ct.id === 'cars' ? 'Garage' : ct.id === 'aircraft' ? 'Hangar' : 'Marina'}
            </button>
          ))}
        </div>

        <div className="line" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="sort-pills">
            <button className={viewMode === 'showroom' ? 'active' : ''} onClick={() => setViewMode('showroom')}>Showroom Stage</button>
            <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>Collection Grid ({ownedItems.length})</button>
          </div>
          {!readOnly && storage && act && (
            <button className="secondary small" onClick={() => act({ type: 'upgradeStorage', kind: meta.storageKey })}>
              Expand +{meta.add} {meta.unit} ({money(meta.storageCost * (cap || 1))})
            </button>
          )}
        </div>
      </div>

      {ownedItems.length === 0 ? (
        <section>
          <span className="eyebrow">EMPTY {meta.storageKey.toUpperCase()}</span>
          <h3>No {catId} owned yet</h3>
          <p className="muted">Purchase luxury {catId} in the Assets catalogue to showcase them here.</p>
          {onBrowseCatalogue && !readOnly && (
            <button onClick={() => onBrowseCatalogue(catId)}>Browse {meta.label}</button>
          )}
        </section>
      ) : viewMode === 'showroom' && selected ? (
        <div className="showroom-layout">
          <div className="showroom-stage-card">
            <div
              className={`showroom-scene ${meta.sceneClass}`}
              onTouchStart={e => {
                const t = e.touches[0];
                touchStart.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={e => {
                if (!touchStart.current) return;
                const t = e.changedTouches[0];
                const dx = t.clientX - touchStart.current.x;
                const dy = t.clientY - touchStart.current.y;
                touchStart.current = null;
                if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
                  step(dx < 0 ? 1 : -1);
                }
              }}
            >
              <span className="showroom-counter">{curIndex + 1} / {ownedItems.length}</span>
              <button type="button" className="showroom-zoom-btn" onClick={() => setLightbox(true)} aria-label="Inspect full-screen image">
                Inspect 🔍
              </button>
              {ownedItems.length > 1 && (
                <>
                  <button type="button" className="showroom-nav-btn prev" onClick={() => step(-1)} aria-label="Previous vehicle">‹</button>
                  <button type="button" className="showroom-nav-btn next" onClick={() => step(1)} aria-label="Next vehicle">›</button>
                </>
              )}
              <div key={`${selected.id}-${slideDir}`} className={`showroom-vehicle-wrap slide-${catId}-${slideDir}`}>
                <GameArt id={selected.id} item={selected} wide />
              </div>
              <div className="showroom-floor-shadow" />
            </div>

            {ownedItems.length > 1 && (
              <div className="showroom-rail" role="listbox" aria-label="Owned vehicles">
                {ownedItems.map((it, idx) => (
                  <button
                    key={it.id}
                    type="button"
                    className={`showroom-thumb ${it.id === selected.id ? 'active' : ''}`}
                    onClick={() => {
                      setSlideDir(idx >= curIndex ? 'next' : 'prev');
                      setSelectedId(it.id);
                    }}
                  >
                    <GameArt id={it.id} item={it} wide />
                    <span>{it.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <section key={selected.id} className="showroom-details-card showroom-detail-fade">
            <div className="line">
              <span className="eyebrow">{(selected.category || catId).toUpperCase()}</span>
              {isLocked && <span className="badge-pending">IN AUCTION</span>}
            </div>
            <h2 style={{ marginTop: 4 }}>{selected.name}</h2>
            <div className="profile-kv"><span>New Asset Price</span><strong>{money(selected.price)}</strong></div>
            <div className="profile-kv"><span>Instant Sell Payout (50%)</span><strong>{money(selected.price * 0.5)}</strong></div>
            <div className="profile-kv"><span>Collection Slot</span><strong>{curIndex + 1} of {ownedItems.length}</strong></div>

            {!readOnly && act && (
              <div className="buttons" style={{ marginTop: 14 }}>
                <button
                  className="secondary"
                  disabled={isLocked}
                  onClick={() => act({ type: 'trade', category: 'assets', item: selected.id, sell: true })}
                >
                  {isLocked ? 'Locked in Auction' : `Sell (50%) · ${money(selected.price * 0.5)}`}
                </button>
                {onStartAuction && !isLocked && online && (
                  <button onClick={() => onStartAuction(selected)}>Sell at Auction</button>
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="sort-pills">
              <button className={sortBy === 'price_desc' ? 'active' : ''} onClick={() => setSortBy('price_desc')}>Expensive first</button>
              <button className={sortBy === 'price_asc' ? 'active' : ''} onClick={() => setSortBy('price_asc')}>Cheap first</button>
              <button className={sortBy === 'name' ? 'active' : ''} onClick={() => setSortBy('name')}>Name A–Z</button>
            </div>
            <input type="search" placeholder="Search owned…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="collection-grid">
            {filteredItems.map(it => {
              const locked = lockedAssets.includes(it.id);
              return (
                <section
                  key={it.id}
                  className="garage-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSlideDir('init');
                    setSelectedId(it.id);
                    setViewMode('showroom');
                  }}
                >
                  <div className="garage-media">
                    <GameArt id={it.id} item={it} wide />
                    {locked && <span className="media-pill owned">In Auction</span>}
                  </div>
                  <div className="garage-body">
                    <h3>{it.name}</h3>
                    <p className="garage-tier">{money(it.price)}</p>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {lightbox && selected && (
        <div className="overlay" onClick={() => setLightbox(false)}>
          <section style={{ width: 'min(95vw, 760px)', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
            <div className="line" style={{ marginBottom: 10 }}>
              <strong>{selected.name}</strong>
              <button className="secondary small" onClick={() => setLightbox(false)}>Close ✕</button>
            </div>
            <div className="showroom-scene scene-cars" style={{ borderRadius: 14, minHeight: 320 }}>
              <div className="showroom-vehicle-wrap" style={{ height: 280 }}>
                <GameArt id={selected.id} item={selected} wide />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
