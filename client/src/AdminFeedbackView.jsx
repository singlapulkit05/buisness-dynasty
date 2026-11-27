import React, { useState, useEffect } from 'react';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_PRIORITIES
} from '../../shared/feedback.js';
import { api } from './storage.js';

export default function AdminFeedbackView({ online, onOpenPlayer }) {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ new: 0, in_review: 0, planned: 0, resolved: 0, closed: 0 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [archived, setArchived] = useState('false');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [detail, setDetail] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [visibility, setVisibility] = useState('player');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function loadInbox(targetPage = page) {
    if (!online) return;
    setErr('');
    try {
      const params = new URLSearchParams({
        q, status, category, priority, archived, sort, page: String(targetPage), limit: '15'
      });
      const res = await api('/admin/feedback?' + params.toString());
      setItems(res.items || []);
      setCounts(res.counts || {});
      setPages(res.pages || 1);
      setPage(res.page || 1);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    loadInbox(1);
  }, [online, status, category, priority, archived, sort]);

  async function openTicket(id) {
    setErr('');
    setBusy(true);
    try {
      const res = await api('/admin/feedback/' + id);
      setDetail(res);
      loadInbox();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function patchTicket(patch) {
    if (!detail) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await api('/admin/feedback/' + detail.ticket._id, patch, 'PATCH');
      setMsg('Ticket updated');
      await openTicket(detail.ticket._id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!detail) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await api(`/admin/feedback/${detail.ticket._id}/messages`, { body: replyBody, visibility });
      setReplyBody('');
      setMsg(visibility === 'internal' ? 'Internal note saved' : 'Reply sent to player');
      await openTicket(detail.ticket._id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (detail) {
    const t = detail.ticket;
    return (
      <>
        <div className="line category-bar">
          <button className="secondary small" onClick={() => setDetail(null)}>← Inbox</button>
          <span className="eyebrow">{t.publicTicketId}</span>
        </div>
        {msg && <p className="notice">{msg}</p>}
        {err && <p className="notice negative">{err}</p>}

        <section>
          <div className="line">
            <div>
              <span className="eyebrow">{t.category} · {t.usernameSnapshot}</span>
              <h3>{t.subject}</h3>
            </div>
            <span className="tag">{FEEDBACK_STATUS_LABELS[t.status] || t.status}</span>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Submitted {new Date(t.createdAt).toLocaleString()}
            {t.relatedRoute ? ` · Screen: ${t.relatedRoute}` : ''}
            {t.reportedSeverity ? ` · Player Severity: ${t.reportedSeverity}` : ''}
          </p>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{t.description}</p>
          {t.diagnostics && (
            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: 12, marginTop: 8 }}>
              <b>Diagnostics:</b> v{t.diagnostics.appVersion} · {t.diagnostics.platform} · route={t.diagnostics.route} · pending={t.diagnostics.pendingActions}
            </div>
          )}
          {onOpenPlayer && (
            <button className="secondary small" style={{ marginTop: 10 }} onClick={() => onOpenPlayer(t.usernameSnapshot)}>
              View Player in VIP Manager
            </button>
          )}
        </section>

        <section>
          <span className="eyebrow">TRIAGE CONTROLS</span>
          <div className="bank-grid">
            <label>Status
              <select disabled={busy} value={t.status} onChange={e => patchTicket({ status: e.target.value })}>
                {FEEDBACK_STATUSES.map(st => <option key={st} value={st}>{FEEDBACK_STATUS_LABELS[st]}</option>)}
              </select>
            </label>
            <label>Admin Priority
              <select disabled={busy} value={t.adminPriority} onChange={e => patchTicket({ adminPriority: e.target.value })}>
                {FEEDBACK_PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </label>
          </div>
          <div className="buttons" style={{ marginTop: 8 }}>
            <button className="secondary small" disabled={busy} onClick={() => patchTicket({ markRead: false })}>Mark Unread</button>
            <button className="btn-danger small" disabled={busy} onClick={() => {
              if (t.archivedAt || confirm(`Archive ${t.publicTicketId}?`)) {
                patchTicket({ archived: !t.archivedAt });
              }
            }}>{t.archivedAt ? 'Unarchive' : 'Archive'}</button>
          </div>
        </section>

        <section>
          <span className="eyebrow">MESSAGES &amp; INTERNAL NOTES</span>
          {(detail.messages || []).length === 0 && <p className="muted">No replies or notes yet.</p>}
          {(detail.messages || []).map(m => (
            <div key={m._id} style={{ padding: '10px', margin: '8px 0', borderRadius: 10, background: m.visibility === 'internal' ? '#fef3c7' : '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div className="line">
                <strong>{m.authorUsername} ({m.authorRole})</strong>
                <span className="tag">{m.visibility === 'internal' ? 'INTERNAL NOTE' : 'PUBLIC'}</span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{m.body}</p>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{new Date(m.createdAt).toLocaleString()}</div>
            </div>
          ))}
          <form onSubmit={sendMessage} style={{ marginTop: 12 }}>
            <div className="trade-tabs">
              <button type="button" className={visibility === 'player' ? 'active' : ''} onClick={() => setVisibility('player')}>Public Reply</button>
              <button type="button" className={visibility === 'internal' ? 'active' : ''} onClick={() => setVisibility('internal')}>Internal Note</button>
            </div>
            <textarea required minLength={2} maxLength={2000} rows={3} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder={visibility === 'internal' ? 'Private admin note (hidden from player)...' : 'Reply visible to player...'} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', font: 'inherit', marginTop: 8 }} />
            <button disabled={busy}>{busy ? 'Saving…' : visibility === 'internal' ? 'Save Internal Note' : 'Send Public Reply'}</button>
          </form>
        </section>

        {(t.auditLog || []).length > 0 && (
          <section>
            <span className="eyebrow">AUDIT LOG</span>
            {[...(t.auditLog || [])].reverse().slice(0, 15).map((a, i) => (
              <div key={i} className="profile-kv" style={{ fontSize: 12 }}>
                <span><b>{a.actor}</b> · {a.action} {a.from ? `${a.from} → ` : ''}{a.to || ''}</span>
                <span className="muted">{new Date(a.at).toLocaleString()}</span>
              </div>
            ))}
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <section className="admin-stats">
        <div className="admin-stat warn"><span>New</span><strong>{counts.new || 0}</strong></div>
        <div className="admin-stat"><span>In Review</span><strong>{counts.in_review || 0}</strong></div>
        <div className="admin-stat"><span>Planned</span><strong>{counts.planned || 0}</strong></div>
        <div className="admin-stat ok"><span>Resolved</span><strong>{counts.resolved || 0}</strong></div>
      </section>

      {err && <p className="notice negative">{err}</p>}

      <section className="admin-controls">
        <form onSubmit={e => { e.preventDefault(); loadInbox(1); }} className="coupon-form">
          <input type="search" placeholder="Search ticket ID, player, subject…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="small">Search</button>
        </form>
        <div className="bank-grid" style={{ marginTop: 8 }}>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            {FEEDBACK_STATUSES.map(st => <option key={st} value={st}>{FEEDBACK_STATUS_LABELS[st]}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">All Categories</option>
            {FEEDBACK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="all">All Priorities</option>
            {FEEDBACK_PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
        <label className="check-row" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={archived === 'true'} onChange={e => setArchived(e.target.checked ? 'true' : 'false')} />
          Show Archived Tickets
        </label>
      </section>

      {items.length === 0 && <section><p className="muted">No feedback tickets match the current filters.</p></section>}

      {items.map(t => (
        <section key={t._id} className={`admin-user-card ${t.unreadByAdmin ? 'is-pending' : ''}`} style={{ cursor: 'pointer' }} onClick={() => openTicket(t._id)}>
          <div className="line">
            <div>
              <span className="eyebrow">{t.publicTicketId} · {t.category} · {t.adminPriority.toUpperCase()}</span>
              <h3>{t.subject}</h3>
            </div>
            <span className={t.unreadByAdmin ? 'badge-pending' : 'tag'}>
              {t.unreadByAdmin ? 'UNREAD' : (FEEDBACK_STATUS_LABELS[t.status] || t.status)}
            </span>
          </div>
          <div className="admin-meta">
            <span>Player: <b>{t.usernameSnapshot}</b></span>
            <span>{new Date(t.createdAt).toLocaleString()}</span>
          </div>
        </section>
      ))}

      {pages > 1 && (
        <div className="buttons">
          <button className="secondary small" disabled={page <= 1} onClick={() => loadInbox(page - 1)}>Prev</button>
          <span className="muted" style={{ alignSelf: 'center' }}>Page {page} / {pages}</span>
          <button className="secondary small" disabled={page >= pages} onClick={() => loadInbox(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
