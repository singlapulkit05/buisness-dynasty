import React, { useState, useEffect } from 'react';
import { money } from '../../shared/format.js';
import { api } from './storage.js';

export default function PlayerProfileView({ username, online, onBack }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!online) {
      setLoading(false);
      setErr('Connect to the internet to view player profiles.');
      return;
    }
    let alive = true;
    setLoading(true);
    setErr('');
    api(`/players/${encodeURIComponent(username)}/profile`)
      .then(d => { if (alive) setProfile(d); })
      .catch(e => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [username, online]);

  return (
    <div className="finance-dash">
      <div className="line category-bar">
        <button className="secondary small" onClick={onBack}>← Back</button>
        <span className="eyebrow">PUBLIC EMPIRE PROFILE</span>
      </div>

      {loading && <section><p className="muted">Loading profile…</p></section>}
      {err && <section><p className="negative">{err}</p></section>}

      {profile && (
        <>
          <section className="profile-hero">
            <div className="line">
              <div className="art-heading">
                <div className="admin-avatar">{profile.username[0].toUpperCase()}</div>
                <div>
                  <span className="eyebrow">PLAYER</span>
                  <h2>{profile.username}</h2>
                </div>
              </div>
              <span className={profile.premium ? 'badge-premium' : 'badge-free'}>
                {profile.premium ? '◆ VIP' : 'PLAYER'}
              </span>
            </div>
            <div className="stat-chips" style={{ marginTop: 10 }}>
              <span>Level {profile.level}</span>
              <span>{profile.businessesCount} businesses</span>
              <span>{profile.achievementsCount} achievements</span>
              <span>{profile.researchCount} tech unlocked</span>
            </div>
            {profile.snapshotAt && (
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                Last validated snapshot: {new Date(profile.snapshotAt).toLocaleString()}
              </p>
            )}
          </section>

          <div className="desktop-grid-2">
            <section className="card-networth">
              <span className="eyebrow">FINANCIAL OVERVIEW</span>
              {profile.netWorth !== null ? (
                <>
                  <h2>{money(profile.netWorth)}</h2>
                  <div className="profile-kv"><span>Portfolio Value</span><strong>{money(profile.investVal || 0)}</strong></div>
                </>
              ) : (
                <p className="muted">Financial details hidden by player privacy settings.</p>
              )}
              {profile.propertiesCount !== null ? (
                <>
                  <div className="profile-kv"><span>Properties Owned</span><strong>{profile.propertiesCount}</strong></div>
                  <div className="profile-kv"><span>Luxury Assets</span><strong>{profile.assetsCount}</strong></div>
                </>
              ) : (
                <p className="muted">Collection counts hidden by player privacy settings.</p>
              )}
            </section>

            <section>
              <span className="eyebrow">PUBLIC COMPANIES ({profile.businessesCount})</span>
              {profile.businesses.length === 0 ? (
                <p className="muted">No active businesses.</p>
              ) : (
                profile.businesses.map((b, i) => (
                  <div key={i} className="profile-kv">
                    <span><b>{b.name}</b> <span className="muted">({b.type})</span></span>
                    <strong>Lv {b.level}{b.branches > 0 ? ` · ${b.branches} branches` : ''}</strong>
                  </div>
                ))
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
