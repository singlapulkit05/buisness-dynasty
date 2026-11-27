import React, { useState, useEffect } from 'react';
import pkg from '../package.json';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUS_LABELS,
  validateFeedbackInput,
  validateFeedbackMessage
} from '../../shared/feedback.js';
import {
  api,
  readFeedbackDraft,
  writeFeedbackDraft,
  clearFeedbackDraft,
  readFeedbackQueue,
  enqueueFeedback,
  removeFeedbackQueueItem
} from './storage.js';

export default function FeedbackView({ username, online, currentRoute, pendingActions, onBack, onUnreadChange }) {
  const [sub, setSub] = useState('new');
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [relatedRoute, setRelatedRoute] = useState(currentRoute || 'Home');
  const [includeDiag, setIncludeDiag] = useState(false);

  const [tickets, setTickets] = useState([]);
  const [queued, setQueued] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyBody, setReplyBody] = useState('');

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [receipt, setReceipt] = useState(null);

  // Load scoped draft + queued offline submissions
  useEffect(() => {
    let alive = true;
    readFeedbackDraft(username).then(d => {
      if (!alive || !d) return;
      if (d.category) setCategory(d.category);
      if (d.subject) setSubject(d.subject);
      if (d.description) setDescription(d.description);
      if (d.severity) setSeverity(d.severity);
      if (d.relatedRoute) setRelatedRoute(d.relatedRoute);
    });
    readFeedbackQueue(username).then(q => { if (alive) setQueued(q); });
    return () => { alive = false; };
  }, [username]);

  // Persist draft scoped to username
  useEffect(() => {
    if (!username) return;
    writeFeedbackDraft(username, { category, subject, description, severity, relatedRoute });
  }, [username, category, subject, description, severity, relatedRoute]);

  async function loadTickets() {
    if (!online) return;
    try {
      const list = await api('/feedback/me');
      setTickets(list);
      if (onUnreadChange) onUnreadChange(list.filter(t => t.unreadReply).length);
    } catch (e) {
      setErrMsg(e.message);
    }
  }

  // Flush queued offline feedback on reconnect
  useEffect(() => {
    if (!online || !username) return;
    (async () => {
      const q = await readFeedbackQueue(username);
      for (const item of q) {
        try {
          await api('/feedback', item.payload);
          await removeFeedbackQueueItem(item.id);
        } catch {
          // Keep in queue if transient failure
        }
      }
      setQueued(await readFeedbackQueue(username));
      await loadTickets();
    })();
  }, [online, username]);

  async function submitFeedback(e) {
    e.preventDefault();
    setErrMsg('');
    setStatusMsg('');
    setReceipt(null);
    setBusy(true);
    try {
      const payload = validateFeedbackInput({
        category,
        subject,
        description,
        reportedSeverity: category === 'Bug report' ? severity : null,
        relatedRoute,
        diagnostics: includeDiag ? {
          appVersion: pkg.version || '2.4.0',
          platform: navigator.platform || 'web',
          route: currentRoute || 'Home',
          pendingActions: pendingActions || 0
        } : null,
        clientRequestId: crypto.randomUUID()
      });

      if (!online) {
        await enqueueFeedback(username, { id: payload.clientRequestId, payload, createdAt: Date.now() });
        setQueued(await readFeedbackQueue(username));
        await clearFeedbackDraft(username);
        setSubject('');
        setDescription('');
        setStatusMsg('Saved locally — not yet submitted. Will send automatically when online.');
        setSub('mine');
        return;
      }

      const created = await api('/feedback', payload);
      await clearFeedbackDraft(username);
      setSubject('');
      setDescription('');
      setReceipt(created);
      setStatusMsg(`Submitted (${created.publicTicketId})`);
      await loadTickets();
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function openTicket(id) {
    setErrMsg('');
    setBusy(true);
    try {
      const res = await api('/feedback/' + id);
      setActiveTicket(res.ticket);
      setMessages(res.messages || []);
      await loadTickets();
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendFollowUp(e) {
    e.preventDefault();
    if (!activeTicket) return;
    setErrMsg('');
    setBusy(true);
    try {
      const body = validateFeedbackMessage(replyBody);
      const msg = await api(`/feedback/${activeTicket._id}/messages`, { body });
      setMessages(m => [...m, msg]);
      setReplyBody('');
      await loadTickets();
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const unreadCount = tickets.filter(t => t.unreadReply).length;

  return (
    <div className="finance-dash">
      <div className="line category-bar">
        <button className="secondary small" onClick={() => activeTicket ? setActiveTicket(null) : onBack()}>
          ← {activeTicket ? 'My Feedback' : 'Back'}
        </button>
        <span className="eyebrow">FEEDBACK &amp; SUPPORT</span>
      </div>

      {!activeTicket && (
        <div className="detail-tabs">
          <button className={sub === 'new' ? 'active' : ''} onClick={() => setSub('new')}>Submit Feedback</button>
          <button className={sub === 'mine' ? 'active' : ''} onClick={() => { setSub('mine'); loadTickets(); }}>
            My Feedback ({tickets.length + queued.length}){unreadCount > 0 ? ` · ${unreadCount} new` : ''}
          </button>
        </div>
      )}

      {statusMsg && <p className="notice" role="status">{statusMsg}</p>}
      {errMsg && <p className="notice negative" role="alert">{errMsg}</p>}

      {receipt && !activeTicket && (
        <section className="card-networth">
          <span className="eyebrow">SUBMISSION RECEIPT</span>
          <h3>{receipt.publicTicketId} · {receipt.subject}</h3>
          <p className="muted">
            Status: <b>{FEEDBACK_STATUS_LABELS[receipt.status] || receipt.status}</b> · {new Date(receipt.createdAt).toLocaleString()}
          </p>
        </section>
      )}

      {!activeTicket && sub === 'new' && (
        <section>
          <span className="eyebrow">REPORT OR SUGGEST</span>
          <h3>Send to Game Administrator</h3>
          <p className="muted" style={{ fontSize: 12 }}>
            Submitting as <b>{username}</b>. Do not include passwords, tokens, or sensitive personal details. Screenshot uploads are currently disabled.
          </p>
          <form onSubmit={submitFeedback}>
            <label>Category
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {FEEDBACK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {category === 'Bug report' && (
              <label>Bug Severity
                <select value={severity} onChange={e => setSeverity(e.target.value)}>
                  {FEEDBACK_SEVERITIES.map(sv => <option key={sv} value={sv}>{sv.toUpperCase()}</option>)}
                </select>
              </label>
            )}
            <label>Related Screen
              <input maxLength={120} value={relatedRoute} onChange={e => setRelatedRoute(e.target.value)} placeholder="e.g. Home, Business, Markets" />
            </label>
            <label>Subject (5–120 chars)
              <input required minLength={5} maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief summary of the issue or idea" />
            </label>
            <label>Description (20–3,000 chars)
              <textarea required minLength={20} maxLength={3000} rows={5} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what happened or what you would like to see..." style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', font: 'inherit' }} />
            </label>
            <label className="check-row" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={includeDiag} onChange={e => setIncludeDiag(e.target.checked)} />
              Include minimal diagnostics (app version, platform, screen, pending sync count)
            </label>
            <button disabled={busy} style={{ marginTop: 12 }}>
              {busy ? 'Submitting…' : online ? 'Submit Feedback' : 'Save Offline Draft'}
            </button>
          </form>
        </section>
      )}

      {!activeTicket && sub === 'mine' && (
        <>
          {queued.map(q => (
            <section key={q.id}>
              <div className="line">
                <strong>{q.payload.subject}</strong>
                <span className="tag">Saved locally — not yet submitted</span>
              </div>
              <p className="muted">{q.payload.category} · Queued {new Date(q.createdAt).toLocaleString()}</p>
            </section>
          ))}
          {tickets.length === 0 && queued.length === 0 && (
            <section><p className="muted">You haven&apos;t submitted any feedback yet.</p></section>
          )}
          {tickets.map(t => (
            <section key={t._id} style={{ cursor: 'pointer' }} onClick={() => openTicket(t._id)}>
              <div className="line">
                <div>
                  <span className="eyebrow">{t.publicTicketId} · {t.category}</span>
                  <h3>{t.subject}</h3>
                </div>
                <span className={t.unreadReply ? 'badge-premium' : 'tag'}>
                  {t.unreadReply ? 'NEW REPLY' : (FEEDBACK_STATUS_LABELS[t.status] || t.status)}
                </span>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>Updated {new Date(t.updatedAt).toLocaleString()}</p>
            </section>
          ))}
        </>
      )}

      {activeTicket && (
        <>
          <section>
            <div className="line">
              <div>
                <span className="eyebrow">{activeTicket.publicTicketId} · {activeTicket.category}</span>
                <h3>{activeTicket.subject}</h3>
              </div>
              <span className="tag">{FEEDBACK_STATUS_LABELS[activeTicket.status] || activeTicket.status}</span>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Submitted {new Date(activeTicket.createdAt).toLocaleString()}
              {activeTicket.relatedRoute ? ` · Screen: ${activeTicket.relatedRoute}` : ''}
              {activeTicket.reportedSeverity ? ` · Severity: ${activeTicket.reportedSeverity}` : ''}
            </p>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{activeTicket.description}</p>
          </section>

          <section>
            <span className="eyebrow">CONVERSATION</span>
            {messages.length === 0 && <p className="muted">No replies yet. The administrator will review your ticket soon.</p>}
            {messages.map(m => (
              <div key={m._id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div className="line">
                  <strong>{m.authorRole === 'admin' ? 'Admin Support' : m.authorUsername}</strong>
                  <span className="muted" style={{ fontSize: 11 }}>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{m.body}</p>
              </div>
            ))}
            {activeTicket.status !== 'closed' ? (
              <form onSubmit={sendFollowUp} style={{ marginTop: 12 }}>
                <label>Send Follow-up
                  <textarea required minLength={2} maxLength={2000} rows={3} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Add more details or reply to admin..." style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', font: 'inherit' }} />
                </label>
                <button disabled={busy}>{busy ? 'Sending…' : 'Send Reply'}</button>
              </form>
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>This ticket is closed.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
