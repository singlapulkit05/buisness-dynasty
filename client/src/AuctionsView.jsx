import React, { useState, useEffect, useRef } from 'react';
import GameArt from './GameArt.jsx';
import { money } from '../../shared/format.js';
import { api } from './storage.js';

const timeLeft = ms => {
  if (ms <= 0) return 'Ended';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
};

export default function AuctionsView({ c, online, route, navigate, onCloudUpdate, onOpenProfile, onAlert, onConfirm }) {
  const [sub, setSub] = useState(route.name === 'auctions_mine' ? 'mine' : 'live');
  const [items, setItems] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('ending_soon');

  const [detail, setDetail] = useState(null);
  const [bidAmt, setBidAmt] = useState('');
  const bidDirtyRef = useRef(false);
  const activeAucIdRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  async function loadMarketplace(status = sub === 'ended' ? 'ended' : 'active') {
    if (!online) return;
    setErr('');
    try {
      const params = new URLSearchParams({ category: cat, q, sort, status });
      const res = await api('/auctions?' + params.toString());
      setItems(res);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function loadMine() {
    if (!online) return;
    setErr('');
    try {
      const [ls, bs] = await Promise.all([api('/auctions/me/listings'), api('/auctions/me/bids')]);
      setMyListings(ls);
      setMyBids(bs);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function loadDetail(id) {
    if (!online) return;
    setErr('');
    try {
      const res = await api('/auctions/' + id);
      setDetail(res);
      const nextMin = String(res.auction.minNextBid);
      const switchedAuction = activeAucIdRef.current !== id;
      if (switchedAuction) {
        activeAucIdRef.current = id;
        bidDirtyRef.current = false;
        setBidAmt(nextMin);
      } else {
        setBidAmt(prev => {
          const prevNum = Number(prev);
          const minNum = Number(nextMin);
          if (!bidDirtyRef.current || !prev || !Number.isFinite(prevNum) || prevNum < minNum) {
            bidDirtyRef.current = false;
            return nextMin;
          }
          return prev;
        });
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (route.name === 'auction_detail' && route.params.auctionId) {
      loadDetail(route.params.auctionId);
      const iv = setInterval(() => loadDetail(route.params.auctionId), 5000);
      return () => clearInterval(iv);
    } else if (route.name === 'auctions_mine' || sub === 'mine') {
      loadMine();
    } else {
      loadMarketplace();
    }
  }, [route.name, route.params.auctionId, sub, cat, sort, online]);

  async function placeBid(e) {
    e.preventDefault();
    if (!detail || !online || busy) return;
    const submitAmt = Number(bidAmt);
    if (!Number.isFinite(submitAmt) || submitAmt <= 0) return;
    if (onConfirm) {
      const ok = await onConfirm({
        title: `Confirm Bid: ${detail.auction.assetName}`,
        message: `Place a binding bid of ${money(submitAmt)}? Funds will be held in escrow until outbid or settled.`,
        confirmLabel: 'Place Bid'
      });
      if (!ok) return;
    }
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await api(`/auctions/${detail.auction._id}/bids`, { amount: submitAmt });
      if (onCloudUpdate && res.cloud) await onCloudUpdate(res.cloud);
      if (res.auction) {
        setDetail(prev => ({ ...(prev || {}), auction: res.auction }));
        bidDirtyRef.current = false;
        setBidAmt(String(res.auction.minNextBid));
      }
      setMsg('Bid accepted and funds placed in escrow.');
      if (onAlert) onAlert('Bid Accepted', `Leading bid ${money(submitAmt)} placed in escrow.`, 'success');
      await loadDetail(detail.auction._id);
    } catch (e) {
      setErr(e.message);
      if (onAlert) onAlert('Bid Rejected', e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelListing(id) {
    if (!online || busy) return;
    const ok = onConfirm
      ? await onConfirm({ title: 'Cancel Auction', message: 'Cancel this auction listing and unlock your asset?', confirmLabel: 'Cancel Listing', danger: true })
      : confirm('Cancel this auction and unlock your asset?');
    if (!ok) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await api(`/auctions/${id}/cancel`, {});
      if (onCloudUpdate && res.cloud) await onCloudUpdate(res.cloud);
      setMsg('Auction cancelled and asset unlocked.');
      await loadDetail(id);
    } catch (e) {
      setErr(e.message);
      if (onAlert) onAlert('Cancel Failed', e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (route.name === 'auction_detail') {
    const a = detail?.auction;
    const assetItem = a ? c.assets.find(x => x.id === a.catalogueId) : null;
    const endsMs = a ? new Date(a.endsAt).getTime() : 0;
    return (
      <div className="finance-dash">
        <div className="line category-bar">
          <button className="secondary small" onClick={() => navigate('/auctions')}>← All Auctions</button>
          <span className="eyebrow">AUCTION DETAIL</span>
        </div>
        {!online && <p className="notice">Online connection required for live bidding.</p>}
        {msg && <p className="notice">{msg}</p>}
        {err && <p className="notice negative">{err}</p>}
        {!a ? (
          <section><p className="muted">{online ? 'Loading auction…' : 'Offline'}</p></section>
        ) : (
          <div className="desktop-grid-2">
            <section>
              {assetItem && <div className="card-media" style={{ marginBottom: 10 }}><GameArt id={assetItem.id} item={assetItem} wide /></div>}
              <div className="line">
                <div>
                  <span className="eyebrow">{a.category.toUpperCase()}</span>
                  <h3>{a.assetName}</h3>
                </div>
                <span className="tag">{a.status.toUpperCase()}</span>
              </div>
              {assetItem && <div className="profile-kv"><span>Catalogue Reference</span><strong>{money(assetItem.price)}</strong></div>}
              <div className="profile-kv">
                <span>Seller</span>
                <button className="secondary small" onClick={() => onOpenProfile(a.sellerUsername)}>{a.sellerUsername} ›</button>
              </div>
              <div className="profile-kv">
                <span>{a.highestBidAmount ? 'Current Highest Bid' : 'Starting Bid'}</span>
                <strong className="green">{money(a.highestBidAmount || a.startingBid)}</strong>
              </div>
              {a.hasReserve && (
                <div className="profile-kv">
                  <span>Reserve Price</span>
                  <strong className={a.reserveMet ? 'green' : 'negative'}>{a.reserveMet ? 'Met' : 'Not yet met'}</strong>
                </div>
              )}
              <div className="profile-kv"><span>Time Remaining</span><strong>{a.status === 'active' ? timeLeft(endsMs - nowMs) : a.status.toUpperCase()}</strong></div>
              <div className="profile-kv"><span>Ends At</span><span className="muted">{new Date(a.endsAt).toLocaleString()}</span></div>
            </section>

            <section>
              <span className="eyebrow">BIDDING &amp; ACTIONS</span>
              {a.status === 'active' && !a.isSeller && (
                <form onSubmit={placeBid}>
                  <p className="muted" style={{ fontSize: 12 }}>
                    Min bid: <b>{money(a.minNextBid)}</b> · Max cap (new price): <b>{money(a.cataloguePrice || assetItem?.price || 0)}</b>. Winning bids incur a {(a.feeRate * 100).toFixed(0)}% seller fee.
                  </p>
                  {a.highestBidAmount && Number(a.highestBidAmount) >= Number(a.cataloguePrice || assetItem?.price || Infinity) ? (
                    <p className="green">Maximum auction price reached — awaiting auction close.</p>
                  ) : (
                    <>
                      <label>Your Bid ($)
                        <input type="number" min={Number(a.minNextBid)} max={Number(a.cataloguePrice || assetItem?.price || 1e12)} step="any" value={bidAmt} onChange={e => { bidDirtyRef.current = true; setBidAmt(e.target.value); }} />
                      </label>
                      <button disabled={!online || busy || endsMs <= nowMs}>
                        {busy ? 'Submitting…' : a.isLeading ? 'Increase Leading Bid' : `Place Bid · ${money(bidAmt || 0)}`}
                      </button>
                    </>
                  )}
                </form>
              )}
              {a.isSeller && a.status === 'active' && (
                <div>
                  <p className="muted">This is your listing. {a.bidCount > 0 ? 'Bidding is active; listing cannot be cancelled.' : 'No bids yet — you may cancel.'}</p>
                  {a.bidCount === 0 && (
                    <button className="btn-danger" disabled={!online || busy} onClick={() => cancelListing(a._id)}>Cancel Listing</button>
                  )}
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <span className="eyebrow">BID HISTORY ({a.bidCount})</span>
                {(detail.bids || []).length === 0 ? <p className="muted">No bids placed yet.</p> : detail.bids.map(b => (
                  <div key={b._id} className="profile-kv">
                    <span><b>{b.bidderUsername}</b> · <span className="muted">{new Date(b.acceptedAt).toLocaleTimeString()}</span></span>
                    <strong className="green">{money(b.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="finance-dash">
      <div className="line category-bar">
        <h2>Asset Auctions</h2>
        <span className="eyebrow">{online ? 'LIVE MARKETPLACE' : 'OFFLINE'}</span>
      </div>
      {!online && <p className="notice">Connect to the internet to browse and bid in player-to-player auctions.</p>}
      {err && <p className="notice negative">{err}</p>}

      <div className="detail-tabs">
        <button className={sub === 'live' ? 'active' : ''} onClick={() => { setSub('live'); navigate('/auctions'); }}>Live Auctions</button>
        <button className={sub === 'mine' ? 'active' : ''} onClick={() => { setSub('mine'); navigate('/auctions/mine'); }}>My Listings &amp; Bids</button>
        <button className={sub === 'ended' ? 'active' : ''} onClick={() => { setSub('ended'); navigate('/auctions'); }}>Ended</button>
      </div>

      {sub !== 'mine' ? (
        <>
          <div className="filter-bar">
            <div className="sort-pills">
              {[['ending_soon', 'Ending Soon'], ['newest', 'Newest'], ['price_asc', 'Lowest'], ['price_desc', 'Highest']].map(([k, lbl]) => (
                <button key={k} className={sort === k ? 'active' : ''} onClick={() => setSort(k)}>{lbl}</button>
              ))}
            </div>
            <div className="coupon-form">
              <input type="search" placeholder="Search asset name…" value={q} onChange={e => setQ(e.target.value)} />
              <button className="small" onClick={() => loadMarketplace()}>Filter</button>
            </div>
          </div>
          {items.length === 0 ? (
            <section><p className="muted">No auctions found. List an owned luxury item from the Assets tab!</p></section>
          ) : (
            <div className="collection-grid">
              {items.map(a => {
                const assetItem = c.assets.find(x => x.id === a.catalogueId);
                return (
                  <section key={a._id} className="garage-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/auctions/' + a._id)}>
                    {assetItem && <div className="garage-media"><GameArt id={assetItem.id} item={assetItem} wide /></div>}
                    <div className="garage-body">
                      <span className="eyebrow">{a.category} · {a.sellerUsername}</span>
                      <h3>{a.assetName}</h3>
                      <div className="profile-kv"><span>{a.highestBidAmount ? 'High Bid' : 'Start'}</span><strong className="green">{money(a.highestBidAmount || a.startingBid)}</strong></div>
                      <div className="profile-kv"><span>Bids: {a.bidCount}</span><strong>{a.status === 'active' ? timeLeft(new Date(a.endsAt).getTime() - nowMs) : a.status.toUpperCase()}</strong></div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="desktop-grid-2">
          <section>
            <span className="eyebrow">MY LISTINGS ({myListings.length})</span>
            {myListings.length === 0 ? <p className="muted">You haven&apos;t listed any assets yet.</p> : myListings.map(a => (
              <div key={a._id} className="profile-kv" style={{ cursor: 'pointer' }} onClick={() => navigate('/auctions/' + a._id)}>
                <div><strong>{a.assetName}</strong><div className="muted" style={{ fontSize: 12 }}>{a.status.toUpperCase()} · {a.bidCount} bids</div></div>
                <strong className="green">{money(a.highestBidAmount || a.startingBid)} ›</strong>
              </div>
            ))}
          </section>
          <section>
            <span className="eyebrow">MY BIDS ({myBids.length})</span>
            {myBids.length === 0 ? <p className="muted">You haven&apos;t placed any bids yet.</p> : myBids.map(b => (
              <div key={b._id} className="profile-kv" style={{ cursor: b.auction ? 'pointer' : 'default' }} onClick={() => b.auction && navigate('/auctions/' + b.auction._id)}>
                <div><strong>{b.auction?.assetName || 'Auction'}</strong><div className="muted" style={{ fontSize: 12 }}>{b.status.toUpperCase()}</div></div>
                <strong>{money(b.amount)} ›</strong>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
