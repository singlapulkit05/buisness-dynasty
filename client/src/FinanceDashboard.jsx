import React, { useState } from 'react';
import { money } from '../../shared/format.js';
import { financialStatement } from '../../shared/engine.js';

export default function FinanceDashboard({ s, c, onBack }) {
  const [cat, setCat] = useState('all');
  const fs = financialStatement(s, c);
  const ledger = (s.ledger || []).filter(e => cat === 'all' || e.category === cat);
  const earnedBiz = Number(s.earned?.business || 0);
  const earnedProp = Number(s.earned?.property || 0);
  const earnedDiv = Number(s.earned?.dividend || 0);
  const earnedProj = Number(s.earned?.project || 0);
  const lifetime = earnedBiz + earnedProp + earnedDiv + earnedProj;

  function exportCsv() {
    const rows = [
      ['Timestamp', 'Type', 'Category', 'Source', 'Amount', 'PrevCash', 'NewCash'].join(','),
      ...(s.ledger || []).map(e => [
        new Date(e.at).toISOString(),
        e.type,
        e.category,
        JSON.stringify(String(e.source || '')),
        e.amount,
        e.prevCash,
        e.newCash
      ].join(','))
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dynasty-ledger.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="finance-view">
      <div className="line category-bar">
        <button className="secondary small" onClick={onBack}>← Back</button>
        <button className="secondary small" onClick={exportCsv}>Export CSV</button>
      </div>

      <section className="card-networth">
        <span className="eyebrow">BALANCE SHEET</span>
        <h2>{money(fs.netWorth)}</h2>
        <div className="profile-kv"><span>Cash</span><strong>{money(fs.cash)}</strong></div>
        <div className="profile-kv"><span>Businesses (Valuation)</span><strong>{money(fs.bizVal)}</strong></div>
        <div className="profile-kv"><span>Real Estate</span><strong>{money(fs.propVal)}</strong></div>
        <div className="profile-kv"><span>Stocks &amp; Crypto</span><strong>{money(fs.investVal)}</strong></div>
        <div className="profile-kv"><span>Luxury Assets</span><strong>{money(fs.assetVal)}</strong></div>
        <div className="profile-kv"><span>Total Assets</span><strong>{money(fs.totalAssets)}</strong></div>
        <div className="profile-kv"><span>Liabilities / Debt</span><strong className="negative">{money(fs.liabilities)}</strong></div>
      </section>

      <section>
        <span className="eyebrow">INCOME STATEMENT</span>
        <h3>Hourly &amp; Lifetime P&amp;L</h3>
        <div className="profile-kv"><span>Gross Hourly Revenue</span><strong className="green">+{money(fs.grossRev)}/hr</strong></div>
        <div className="profile-kv"><span>Operating Expenses</span><strong className="negative">-{money(fs.expenses)}/hr</strong></div>
        <div className="profile-kv">
          <span>Net Hourly Profit</span>
          <strong className={Number(fs.netHourly) >= 0 ? 'green' : 'negative'}>
            {Number(fs.netHourly) >= 0 ? '+' : ''}{money(fs.netHourly)}/hr
          </strong>
        </div>
        <div className="profile-kv"><span>Lifetime Earnings</span><strong className="green">{money(lifetime)}</strong></div>
      </section>

      {fs.businessRows.length > 0 && (
        <section>
          <span className="eyebrow">BUSINESS COMPARISON</span>
          <h3>Profitability &amp; ROI</h3>
          <table className="preview-table">
            <thead>
              <tr><th>Company</th><th>Net/hr</th><th>Margin</th><th>ROI/hr</th></tr>
            </thead>
            <tbody>
              {fs.businessRows.map(b => {
                const roi = Number(b.val) > 0 ? (Number(b.netProfit) / Number(b.val)) * 100 : 0;
                return (
                  <tr key={b.id}>
                    <td><b>{b.name || b.type}</b> <span className="muted">Lv{b.level}</span></td>
                    <td className={Number(b.netProfit) >= 0 ? 'green' : 'negative'}>{money(b.netProfit)}</td>
                    <td>{b.margin.toFixed(0)}%</td>
                    <td>{roi.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <span className="eyebrow">FINANCIAL LEDGER</span>
        <h3>Transaction History ({ledger.length})</h3>
        <div className="sort-pills" style={{ margin: '8px 0 12px' }}>
          {[['all', 'All'], ['business', 'Business'], ['invest', 'Invest'], ['property', 'Property'], ['asset', 'Assets']].map(([k, lbl]) => (
            <button key={k} className={cat === k ? 'active' : ''} onClick={() => setCat(k)}>{lbl}</button>
          ))}
        </div>
        {ledger.length === 0 ? (
          <p className="muted">No ledger transactions recorded yet.</p>
        ) : (
          ledger.slice(0, 50).map((e, i) => {
            const amt = Number(e.amount);
            return (
              <div key={e.id || i} className="profile-kv">
                <div>
                  <b>{e.type}</b> <span className="muted">· {e.source}</span>
                  <div className="muted" style={{ fontSize: 11 }}>{new Date(e.at).toLocaleString()}</div>
                </div>
                <strong className={amt >= 0 ? 'green' : 'negative'}>
                  {amt >= 0 ? '+' : ''}{money(e.amount)}
                </strong>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
