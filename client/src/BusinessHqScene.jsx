import React from 'react';
import GameArt from './GameArt.jsx';
import { getBusinessHqTier } from '../../shared/business-hq.js';

export default function BusinessHqScene({
  type,
  name,
  catalogueName,
  color = '#2563eb',
  level = 1,
  infra = 1,
  efficiency = 1,
  branches = 0,
  busy = false,
  isPreview = false
}) {
  const hq = getBusinessHqTier(type, level);
  const blockCount = Math.min(6, Math.max(1, hq.tier + Math.floor((infra - 1) / 4)));

  return (
    <section className={`hq-scene hq-tier-${hq.tier}`} style={{ '--hq-color': color }}>
      <div className="line" style={{ alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">
            {isPreview ? 'VISUAL TIER PREVIEW · ' : ''}{hq.tierLabel.toUpperCase()} · {hq.stageTitle.toUpperCase()}
          </span>
          <h2 style={{ margin: '2px 0' }}>{name || catalogueName}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {catalogueName} · Main Lv {level} · Infra Lv {infra} · Eff Lv {efficiency}
            {branches > 0 ? ` · ${branches} branches` : ''}
          </p>
        </div>
        <span className={busy ? 'badge-pending' : 'lv-badge'}>{busy ? 'ACTIVE JOB' : 'OPERATIONAL'}</span>
      </div>

      <div className="hq-skyline" aria-hidden="true">
        <div className="hq-main-tower">
          <div className="hq-logo-badge" style={{ background: color }}>
            <GameArt id={type} />
          </div>
          <div className="hq-floors">
            {Array.from({ length: blockCount }).map((_, i) => (
              <span key={i} className="hq-floor-bar" />
            ))}
          </div>
        </div>
        <div className="hq-wings">
          {Array.from({ length: Math.min(4, Math.max(1, Math.ceil(infra / 2))) }).map((_, i) => (
            <div key={i} className="hq-wing-block" />
          ))}
        </div>
      </div>

      {hq.nextTierAt && !isPreview && (
        <div className="line muted" style={{ fontSize: 11, marginTop: 8 }}>
          <span>Next visual transformation: <b>{hq.nextStageTitle}</b> at Lv {hq.nextTierAt}</span>
          <span>{Math.min(100, Math.round((level / hq.nextTierAt) * 100))}%</span>
        </div>
      )}
    </section>
  );
}
