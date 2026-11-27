import Dexie from 'dexie';

export const db = new Dexie('dynasty');
db.version(1).stores({ save: 'id' });
db.version(2).stores({
  save: 'id',
  feedbackDrafts: 'username',
  feedbackQueue: 'id, username'
});

export const read = () => db.save.get('current');
export const write = x => db.save.put({ ...x, id: 'current' });

export const readFeedbackDraft = username =>
  username ? db.feedbackDrafts.get(username) : Promise.resolve(null);

export const writeFeedbackDraft = (username, draft) =>
  username ? db.feedbackDrafts.put({ ...draft, username }) : Promise.resolve();

export const clearFeedbackDraft = username =>
  username ? db.feedbackDrafts.delete(username) : Promise.resolve();

export const readFeedbackQueue = username =>
  username ? db.feedbackQueue.where('username').equals(username).toArray() : Promise.resolve([]);

export const enqueueFeedback = (username, item) =>
  username ? db.feedbackQueue.put({ ...item, username }) : Promise.resolve();

export const removeFeedbackQueueItem = id =>
  db.feedbackQueue.delete(id);

export async function api(url, body, method) {
  const r = await fetch('/api' + url, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(Error(data.error || 'Request failed'), { status: r.status, data });
  return data;
}
