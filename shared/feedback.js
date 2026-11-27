export const FEEDBACK_CATEGORIES = [
  'Bug report',
  'Feature suggestion',
  'UI/UX',
  'Gameplay & balance',
  'Trading',
  'Auction',
  'Account/VIP',
  'Other'
];

export const FEEDBACK_SEVERITIES = ['low', 'medium', 'high'];

export const FEEDBACK_STATUSES = ['new', 'in_review', 'planned', 'resolved', 'closed'];

export const FEEDBACK_STATUS_LABELS = {
  new: 'Submitted',
  in_review: 'In Review',
  planned: 'Planned',
  resolved: 'Resolved',
  closed: 'Closed'
};

export const FEEDBACK_PRIORITIES = ['low', 'normal', 'high', 'critical'];

export function validateFeedbackInput(raw = {}) {
  const category = String(raw.category || '').trim();
  if (!FEEDBACK_CATEGORIES.includes(category)) {
    throw Error('Select a valid feedback category');
  }

  const subject = String(raw.subject || '').trim();
  if (subject.length < 5 || subject.length > 120) {
    throw Error('Subject must be 5–120 characters');
  }

  const description = String(raw.description || '').trim();
  if (description.length < 20 || description.length > 3000) {
    throw Error('Description must be 20–3,000 characters');
  }

  let reportedSeverity = null;
  if (raw.reportedSeverity !== undefined && raw.reportedSeverity !== null && raw.reportedSeverity !== '') {
    const sev = String(raw.reportedSeverity).trim().toLowerCase();
    if (!FEEDBACK_SEVERITIES.includes(sev)) {
      throw Error('Invalid severity');
    }
    reportedSeverity = sev;
  }

  const relatedRoute = String(raw.relatedRoute || '').trim().slice(0, 120) || null;

  let diagnostics = null;
  if (raw.diagnostics && typeof raw.diagnostics === 'object') {
    diagnostics = {
      appVersion: String(raw.diagnostics.appVersion || '').slice(0, 32),
      platform: String(raw.diagnostics.platform || '').slice(0, 48),
      route: String(raw.diagnostics.route || '').slice(0, 80),
      pendingActions: Number.isFinite(Number(raw.diagnostics.pendingActions))
        ? Math.max(0, Math.min(10000, Number(raw.diagnostics.pendingActions)))
        : 0
    };
  }

  const clientRequestId = String(raw.clientRequestId || '').trim().slice(0, 80);
  if (!clientRequestId) {
    throw Error('Missing clientRequestId');
  }

  return { category, subject, description, reportedSeverity, relatedRoute, diagnostics, clientRequestId };
}

export function validateFeedbackMessage(rawBody) {
  const body = String(rawBody || '').trim();
  if (body.length < 2 || body.length > 2000) {
    throw Error('Message must be 2–2,000 characters');
  }
  return body;
}

export function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
