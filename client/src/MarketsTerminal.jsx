import React, { useMemo, useState } from 'react';
import { money } from '../../shared/format.js';
import { buildMarketImpactReport } from '../../shared/market-impact.js';

export default function MarketsTerminal({ s, c, liveQuotes, onOpenSymbol, onOpenBusiness, onOpenProperties }) {
  const [sectorFilter, setSectorFilter] = useState('all');
  const report = useMemo(
    () => buildMarketImpactReport(s, c, { quotes: liveQuotes, at: s.at }),
    [s, c, liveQuotes]
  );

  const sectors = useMemo(
    () => ['all', ...new Set(report.heatmap.map(h => h.sector))],
    [report.heatmap]
  );

  const heatItems = useMemo(
    () => report.heatmap.filter(h => sectorFilter === 'all' || h.sector === sectorFilter),
    [report.heatmap, sectorFilter]
  );

  const totalPortfolio = useMemo(
    () => report.heatmap.reduce((acc, h) => acc + h.heldValue, 0),
    [report.heatmap]
  );

  const totalPnl = useMemo(
    () => report.heatmap.reduce((acc, h) => acc + (h.unrealizedPnl || 0), 0),
    [report.heatmap]
  );

  const msLeft = Math.max(0, report.regime.end - s.at);
  const minsLeft = Math.ceil(msLeft / 60000);

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Priority 5: Economic Regime & Live Empire Impact Feedback */}
      <section className="news-ticker">
        <div className="line">
          <div>
            <span className="eyebrow">MACRO REGIME · NEXT SHIFT IN {minsLeft}M</span>
            <h3 style={{ color: '#fff', margin: '4px 0' }}>{report.regime.title}</h3>
          </div>
          <span className="tag" style={{ background: '#1e293b', color: '#93c5fd' }}>SIMULATED LIQUIDITY</span>
        </div>
        <p style={{ color: '#cbd5e1', margin: '0 0 10px', fontSize: 13 }}>{report.regime.summary}</p>

        {report.businessImpacts.length > 0 && (
          <div className="ticker-items">
            {report.businessImpacts.slice(0, 6).map(b => (
              <button
                key={b.id}
                className={`ticker-chip ${b.regimePct >= 0 ? 'up' : 'down'}`}
                onClick={() => onOpenBusiness && onOpenBusiness(b.id)}
              >
                {b.name}: {b.regimePct >= 0 ? '+' : ''}{b.regimePct}% regime · Rival {b.rivalName} ({b.rivalShare}%)
              </button>
            ))}
            {Number(report.propertySummary.totalHourlyRent) > 0 && (
              <button
                className={`ticker-chip ${report.propertySummary.rentPct >= 0 ? 'up' : 'down'}`}
                onClick={() => onOpenProperties && onOpenProperties()}
              >
                Real Estate Rent: {report.propertySummary.rentPct >= 0 ? '+' : ''}{report.propertySummary.rentPct}% ({money(report.propertySummary.totalHourlyRent)}/hr)
              </button>
            )}
          </div>
        )}
      </section>

      {/* Portfolio Allocation & Unrealized P&L Summary */}
      <section style={{ marginBottom: 14 }}>
        <div className="line" style={{ marginBottom: 8 }}>
          <div>
            <span className="eyebrow">MARKET HEATMAP &amp; EXPOSURE</span>
            <h3 style={{ margin: '2px 0' }}>Quote-Driven Liquidity Board</h3>
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong>{money(totalPortfolio)}</strong>
            {totalPortfolio > 0 && (
              <div className={totalPnl >= 0 ? 'green' : 'negative'} style={{ fontSize: 12 }}>
                Unrealized P&amp;L: {totalPnl >= 0 ? '+' : ''}{money(totalPnl)}
              </div>
            )}
          </div>
        </div>

        <div className="sort-pills" style={{ marginBottom: 10 }}>
          {sectors.map(sec => (
            <button key={sec} className={sectorFilter === sec ? 'active' : ''} onClick={() => setSectorFilter(sec)}>
              {sec === 'all' ? 'All Sectors' : sec}
            </button>
          ))}
        </div>

        <div className="heatmap-grid">
          {heatItems.slice(0, 24).map(h => {
            const up = h.pctChange >= 0;
            const intensity = Math.min(1, Math.abs(h.pctChange) / 8);
            const bg = up
              ? `rgba(16, 185, 129, ${(0.08 + intensity * 0.22).toFixed(2)})`
              : `rgba(239, 68, 68, ${(0.08 + intensity * 0.22).toFixed(2)})`;
            return (
              <button
                key={`${h.category}-${h.id}`}
                className="heatmap-cell"
                style={{ background: bg }}
                onClick={() => onOpenSymbol && onOpenSymbol(h.category, h.id)}
              >
                <div className="line" style={{ gap: 4 }}>
                  <strong style={{ fontSize: 12 }}>{h.name}</strong>
                  <span className={up ? 'green' : 'negative'} style={{ fontSize: 11, fontWeight: 700 }}>
                    {up ? '+' : ''}{h.pctChange.toFixed(2)}%
                  </span>
                </div>
                <div className="line muted" style={{ fontSize: 11, marginTop: 4 }}>
                  <span>{money(h.price)}</span>
                  <span>{h.held > 0 ? `${h.held} held` : h.sector}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
