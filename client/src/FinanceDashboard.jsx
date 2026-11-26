import React, { useState } from 'react';
import { money } from '../../shared/format.js';
import { financialStatement } from '../../shared/engine.js';
import { currentEconomyEvent, recentEconomyEvents } from '../../shared/economy-events.js';

export default function FinanceDashboard({ s, c, onBack, act }) {
  const [cat, setCat] = useState('all');
  const [savAmt, setSavAmt] = useState('10000');
  const [loanAmt, setLoanAmt] = useState('25000');
  const fs = financialStatement(s, c);
  const ev = currentEconomyEvent(s.at);
  const news = recentEconomyEvents(s.at, 4);
  const score = s.banking?.creditScore || 680;
  const maxLoan = Math.max(50000, Number(fs.netWorth) * 0.5 * (score / 650));
  const curDebt = (s.banking?.loans || []).reduce((sum, l) => sum + Number(l.remaining), 0);
  const availCredit = Math.max(0, maxLoan - curDebt);
  const estRate = Math.max(5.5, Math.min(20, 22 - (score - 300) * 0.03));
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
        <div className="profile-kv"><span>Savings (4.0% APY)</span><strong className="green">{money(s.banking?.savings || 0)}</strong></div>
        <div className="profile-kv"><span>Liabilities / Debt</span><strong className="negative">{money(fs.liabilities)}</strong></div>
      </section>

      <section className="news-ticker">
        <span className="eyebrow">DYNAMIC ECONOMY &amp; NEWS</span>
        <h3 style={{ color: '#fff', margin: '4px 0' }}>{ev.title}</h3>
        <p style={{ color: '#cbd5e1', margin: '0 0 8px' }}>{ev.summary}</p>
        {news.slice(1).map((n, i) => (
          <div key={i} className="muted" style={{ fontSize: 11, color: '#94a3b8' }}>
            Earlier: {n.title} — {n.summary}
          </div>
        ))}
      </section>

      {act && (
        <section>
          <div className="line">
            <div><span className="eyebrow">PERSONAL BANKING &amp; CREDIT</span><h3>Savings &amp; Loans</h3></div>
            <span className="lv-badge">Score {score}</span>
          </div>
          <div className="profile-kv"><span>Savings Balance (4% APY)</span><strong className="green">{money(s.banking?.savings || 0)}</strong></div>
          <div className="coupon-form">
            <input type="number" min="1" value={savAmt} onChange={e => setSavAmt(e.target.value)} />
            <button className="small" onClick={() => act({ type: 'bankDeposit', amount: Number(savAmt) })}>Deposit</button>
            <button className="secondary small" onClick={() => act({ type: 'bankWithdraw', amount: Number(savAmt) })}>Withdraw</button>
          </div>
          <div className="profile-kv" style={{ marginTop: 10 }}><span>Available Credit ({estRate.toFixed(1)}% APR)</span><strong>{money(availCredit)}</strong></div>
          <div className="coupon-form">
            <input type="number" min="1" value={loanAmt} onChange={e => setLoanAmt(e.target.value)} />
            <button className="small" onClick={() => act({ type: 'takeLoan', amount: Number(loanAmt) })}>Borrow</button>
          </div>
          {(s.banking?.loans || []).map(ln => (
            <div key={ln.id} className="profile-kv">
              <span>Loan ({ln.rate}% APR)</span>
              <div className="line" style={{ gap: 6 }}>
                <strong className="negative">{money(ln.remaining)}</strong>
                <button className="small" onClick={() => act({ type: 'repayLoan', target: ln.id, full: true })}>Pay Off</button>
              </div>
            </div>
          ))}
        </section>
      )}

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
