import React from 'react';
import { money } from '../../shared/format.js';

export default function CelebrationOverlay({ event, onDismiss }) {
  if (!event) return null;
  return (
    <div className="celebration-banner" role="status" aria-live="polite" onClick={onDismiss}>
      <div className="celebration-card">
        <div className="line">
          <div>
            <span className="eyebrow">{event.eyebrow || 'MILESTONE UNLOCKED'}</span>
            <h3>{event.title}</h3>
            <p className="muted" style={{ margin: '2px 0 0' }}>{event.detail}</p>
            {event.value !== undefined && (
              <strong className="green" style={{ display: 'block', marginTop: 4 }}>{money(event.value)}</strong>
            )}
          </div>
          <button type="button" className="secondary small" onClick={onDismiss}>Continue</button>
        </div>
      </div>
    </div>
  );
}
