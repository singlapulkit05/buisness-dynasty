import React, { useState, useEffect } from 'react';
import { money } from '../../shared/format.js';
import { netWorth } from '../../shared/engine.js';
import { RESEARCH_NODES, evaluateAchievements } from '../../shared/engagement.js';
import { api } from './storage.js';

const dur = ms => {
  const n = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60].map(x => String(x).padStart(2, '0')).join(':');
};

export default function EngagementView({ s, c, online, act, onBack, initialTab = 'research' }) {
  const [sub, setSub] = useState(initialTab);
  const [leaders, setLeaders] = useState([]);
  const [lbErr, setLbErr] = useState('');
  const [lbLoading, setLbLoading] = useState(false);

  const nwNum = Number(netWorth(s, c));
  const achs = evaluateAchievements(s, c, nwNum);
  const completedResearch = new Set(s.research?.completed || []);
  const activeResearch = s.research?.active;
  const notifs = s.notifications || [];
  const unreadCount = notifs.filter(n => !n.read).length;

  useEffect(() => {
    if (sub === 'leaderboard' && online) {
      setLbLoading(true);
      setLbErr('');
      api('/leaderboard')
        .then(setLeaders)
        .catch(e => setLbErr(e.message))
        .finally(() => setLbLoading(false));
    }
  }, [sub, online]);

  return (
    <div className="finance-dash">
      <div className="line category-bar">
        <button className="secondary small" onClick={onBack}>← Home</button>
        <span className="eyebrow">EMPIRE HUB</span>
      </div>

      <div className="detail-tabs">
        <button className={sub === 'research' ? 'active' : ''} onClick={() => setSub('research')}>Research</button>
        <button className={sub === 'achievements' ? 'active' : ''} onClick={() => setSub('achievements')}>Missions</button>
        <button className={sub === 'leaderboard' ? 'active' : ''} onClick={() => setSub('leaderboard')}>Leaderboard</button>
        <button className={sub === 'alerts' ? 'active' : ''} onClick={() => setSub('alerts')}>Alerts{unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
      </div>

      {sub === 'research' && (
        <>
          <section className="card-networth">
            <span className="eyebrow">R&amp;D TECHNOLOGY TREE</span>
            <h2>{completedResearch.size} / {RESEARCH_NODES.length} Unlocked</h2>
            {activeResearch ? (
              <p className="green" style={{ marginTop: 6 }}>
                Researching <b>{RESEARCH_NODES.find(n => n.id === activeResearch.id)?.name}</b> · {dur(activeResearch.end - s.at)}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 6 }}>Select a technology node below to boost efficiency and revenue across your empire.</p>
            )}
          </section>

          {RESEARCH_NODES.map(node => {
            const unlocked = completedResearch.has(node.id);
            const inProg = activeResearch?.id === node.id;
            const reqsMet = node.requires.every(r => completedResearch.has(r));
            const canAfford = Number(s.cash) >= node.cost;
            return (
              <section key={node.id} className="upgrade-preview-card">
                <div className="line">
                  <div>
                    <span className="eyebrow">{unlocked ? 'UNLOCKED' : inProg ? 'IN PROGRESS' : 'TECHNOLOGY'}</span>
                    <h3>{node.name}</h3>
                  </div>
                  <span className={unlocked ? 'badge-premium' : 'tag'}>{unlocked ? '✓ DONE' : money(node.cost)}</span>
                </div>
                <p className="muted">{node.desc}</p>
                {node.requires.length > 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    Requires: {node.requires.map(r => RESEARCH_NODES.find(k => k.id === r)?.name || r).join(', ')}
                  </p>
                )}
                {!unlocked && !inProg && (
                  <button
                    disabled={!!activeResearch || !reqsMet || !canAfford}
                    onClick={() => act({ type: 'startResearch', item: node.id })}
                  >
                    {!reqsMet ? 'Prerequisites locked' : !canAfford ? `Need ${money(node.cost - Number(s.cash))}` : `Start Research · ${dur(node.duration)}`}
                  </button>
                )}
              </section>
            );
          })}
        </>
      )}

      {sub === 'achievements' && (
        <>
          <section className="card-networth">
            <span className="eyebrow">ACHIEVEMENTS &amp; MILESTONES</span>
            <h2>{achs.filter(a => a.claimed).length} / {achs.length} Claimed</h2>
          </section>
          {achs.map(a => (
            <section key={a.id}>
              <div className="line">
                <div>
                  <h3>{a.title}</h3>
                  <p className="muted" style={{ margin: '2px 0 6px' }}>{a.desc}</p>
                </div>
                <span className={a.claimed ? 'badge-premium' : a.done ? 'green' : 'tag'}>
                  {a.claimed ? '✓ Claimed' : `+${money(a.rewardCash)}`}
                </span>
              </div>
              <progress max={a.target} value={a.cur} style={{ width: '100%' }} />
              <div className="line muted" style={{ fontSize: 12, marginTop: 4 }}>
                <span>{a.cur.toLocaleString()} / {a.target.toLocaleString()}</span>
                {a.done && !a.claimed && (
                  <button className="small" onClick={() => act({ type: 'claimAchievement', item: a.id })}>Claim Reward</button>
                )}
              </div>
            </section>
          ))}
        </>
      )}

      {sub === 'leaderboard' && (
        <section>
          <span className="eyebrow">GLOBAL RANKINGS</span>
          <h3>Top Cloud Empires</h3>
          {!online && <p className="muted">Connect to the internet to view global player rankings.</p>}
          {online && lbLoading && <p className="muted">Loading rankings…</p>}
          {lbErr && <p className="negative">{lbErr}</p>}
          {online && !lbLoading && leaders.map((p, idx) => (
            <div key={p.username} className="profile-kv" style={{ alignItems: 'center' }}>
              <div>
                <strong>#{idx + 1} {p.username} {p.premium ? '◆' : ''}</strong>
                <div className="muted" style={{ fontSize: 12 }}>Lv {p.level} · {p.businesses} businesses · {p.achievements} badges</div>
              </div>
              <strong className="green">{money(p.netWorth)}</strong>
            </div>
          ))}
        </section>
      )}

      {sub === 'alerts' && (
        <section>
          <div className="line">
            <div>
              <span className="eyebrow">ACTIVITY CENTRE</span>
              <h3>Notifications</h3>
            </div>
            {unreadCount > 0 && (
              <button className="secondary small" onClick={() => act({ type: 'markNotifsRead' })}>Mark all read</button>
            )}
          </div>
          {notifs.length === 0 && <p className="muted">No notifications yet. Completed research, mergers, and milestones appear here.</p>}
          {notifs.map(n => (
            <div key={n.id} className="profile-kv" style={{ opacity: n.read ? 0.7 : 1 }}>
              <div>
                <strong>{n.title}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{n.detail} · {new Date(n.at).toLocaleString()}</div>
              </div>
              {!n.read && <span className="tag">NEW</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
