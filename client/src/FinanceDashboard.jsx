import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { money } from '../../shared/format.js';
import { financialStatement, FINANCIAL_TIME } from '../../shared/engine.js';
import { currentEconomyEvent, recentEconomyEvents } from '../../shared/economy-events.js';
import { buildNetWorthSeries } from '../../shared/market-impact.js';

export default function FinanceDashboard({ s, c, onBack, act }) {
  const [cat, setCat] = useState('all');
  const [savAmt, setSavAmt] = useState('10000');
  const [loanAmt, setLoanAmt] = useState('25000');
  const fs = financialStatement(s, c);
  const nwSeries = buildNetWorthSeries(s, fs.netWorth);
  const ev = currentEconomyEvent(s.at);
  const news = recentEconomyEvents(s.at, 4);
  const score = s.banking?.creditScore || 680;
  const maxLoan = Math.max(50000, Number(fs.netWorth) * 0.5 * (score / 650));
  const curDebt = Number(fs.liabilities || 0);
  const availCredit = Math.max(0, maxLoan - curDebt);
  const utilPct = maxLoan > 0 ? Math.min(100, (curDebt / maxLoan) * 100) : 0;
  const estRate = Number(Math.max(5.5, Math.min(20, 22 - (score - 300) * 0.03)).toFixed(2));
  const ledger = (s.ledger || []).filter(e => cat === 'all' || e.category === cat);
  const earnedBiz = Number(s.earned?.business || 0);
  const earnedProp = Number(s.earned?.property || 0);
  const earnedDiv = Number(s.earned?.dividend || 0);
  const earnedProj = Number(s.earned?.project || 0);
  const lifetime = earnedBiz + earnedProp + earnedDiv + earnedProj;

  const savBalD = new Decimal(fs.savings || '0');
  const savHourly = Number(fs.savHourly || 0);
  const savDaily = savBalD.gt(0) ? Number(savBalD.times(new Decimal(fs.apy).div(100))) : 0;
  const loanHourly = Number(fs.loanHourly || 0);
  const loanDaily = Number(new Decimal(fs.loanPrincipal || '0').times(0).plus(loanHourly * 24));

  const reqLoan = Math.max(0, Number(loanAmt) || 0);
  const reqHourlyInt = reqLoan > 0 ? (reqLoan * (estRate / 100)) * (3600 / FINANCIAL_TIME.REAL_SECONDS_PER_FINANCIAL_YEAR) : 0;
  const reqDailyInt = reqLoan > 0 ? reqLoan * (estRate / 100) : 0;
  const reqTotal24h = reqLoan + reqDailyInt;
  const reqValid = reqLoan >= 1000 && reqLoan <= availCredit && (s.banking?.loans || []).length < 5;

  function csvCell(val) {
    const str = String(val ?? '');
    const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const rows = [
      ['Timestamp', 'Type', 'Category', 'Source', 'Amount', 'PrevCash', 'NewCash'].join(','),
      ...(s.ledger || []).map(e => [
        csvCell(new Date(e.at).toISOString()),
        csvCell(e.type),
        csvCell(e.category),
        csvCell(e.source || ''),
        csvCell(e.amount),
        csvCell(e.prevCash),
        csvCell(e.newCash)
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
        <div className="profile-kv"><span>Savings ({fs.apy}% APY)</span><strong className="green">{money(fs.savings)}</strong></div>
        <div className="profile-kv"><span>Liabilities (Principal + Interest)</span><strong className="negative">{money(fs.liabilities)}</strong></div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
          <span className="eyebrow">NET WORTH TRAJECTORY</span>
          {!nwSeries.ready ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Complete transactions to record and plot your net worth trajectory.</p>
          ) : (() => {
            const vals = nwSeries.points.map(p => p.estNetWorth);
            const lo = Math.min(...vals), hi = Math.max(...vals);
            const span = Math.max(1, hi - lo);
            const pts = nwSeries.points.map((p, idx) => {
              const x = (idx / Math.max(1, nwSeries.points.length - 1)) * 300;
              const y = 64 - ((p.estNetWorth - lo) / span) * 52;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            return (
              <svg className="nw-spark" viewBox="0 0 300 72" role="img" aria-label="Recorded net worth trend">
                <polyline fill="none" stroke="#087f5b" strokeWidth="2.2" points={pts} />
              </svg>
            );
          })()}
        </div>
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
        <>
          <section>
            <div className="line">
              <div>
                <span className="eyebrow" title="1 real second = 6 financial minutes; 24 real hours = 1 financial year (360 days).">ACCELERATED FINANCIAL TIME</span>
                <h3>Savings Account</h3>
              </div>
              <span className="lv-badge" title="Annual Percentage Yield compounded over 24 real hours = 1 financial year">{fs.apy}% APY</span>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              <b>24 real-world hours = 1 financial game year</b> (360 days). Compound interest accrues continuously, even offline.
            </p>
            <div className="profile-kv"><span>Savings Balance</span><strong className="green">{money(fs.savings)}</strong></div>
            <div className="profile-kv"><span>Available Cash</span><strong>{money(fs.cash)}</strong></div>
            <div className="profile-kv"><span title="Compounded interest over the next real-world hour">Est. Hourly Interest</span><strong className="green">+{money(savHourly)}/hr</strong></div>
            <div className="profile-kv"><span title="Compounded interest over 24 real hours (1 financial year)">Est. Daily Interest (24h)</span><strong className="green">+{money(savDaily)}</strong></div>
            <div className="profile-kv"><span>Total Interest Earned</span><strong className="green">+{money(fs.interestEarned)}</strong></div>
            <div className="coupon-form" style={{ marginTop: 10 }}>
              <input type="number" min="1" value={savAmt} onChange={e => setSavAmt(e.target.value)} />
              <button className="small" onClick={() => act({ type: 'bankDeposit', amount: Number(savAmt) })}>Deposit</button>
              <button className="secondary small" onClick={() => act({ type: 'bankWithdraw', amount: Number(savAmt) })}>Withdraw</button>
            </div>
            <div className="buttons" style={{ marginTop: 6 }}>
              <button className="secondary small" disabled={Number(fs.cash) <= 0} onClick={() => setSavAmt(String(Math.floor(Number(fs.cash))))}>Max Deposit</button>
              <button className="secondary small" disabled={Number(fs.savings) <= 0} onClick={() => setSavAmt(String(Math.floor(Number(fs.savings))))}>Max Withdraw</button>
            </div>
          </section>

          <section>
            <div className="line">
              <div><span className="eyebrow">LOANS &amp; CREDIT</span><h3>Personal Credit Line</h3></div>
              <span className="lv-badge" title="Credit score range: 300–850. Repaying loans >= $5,000 improves your score.">Score {score}</span>
            </div>
            <div className="profile-kv"><span>Available Credit</span><strong>{money(availCredit)}</strong></div>
            <div className="profile-kv"><span>Outstanding Principal</span><strong className="negative">{money(fs.loanPrincipal)}</strong></div>
            <div className="profile-kv"><span>Accrued Interest</span><strong className="negative">{money(fs.loanAccrued)}</strong></div>
            <div className="profile-kv"><span>Total Outstanding Debt</span><strong className="negative">{money(fs.liabilities)}</strong></div>
            <div className="profile-kv"><span title="Annual Percentage Rate (simple interest per financial year = 24 real hours)">Applicable APR</span><strong>{estRate.toFixed(2)}% APR</strong></div>
            <div className="profile-kv"><span>Hourly Interest Expense</span><strong className="negative">-{money(loanHourly)}/hr</strong></div>
            <div className="profile-kv"><span>Daily Interest Expense (24h)</span><strong className="negative">-{money(loanDaily)}</strong></div>
            <div className="profile-kv"><span title="Percentage of your total credit limit currently in use">Credit Utilization</span><strong>{utilPct.toFixed(1)}%</strong></div>

            <div className="coupon-form" style={{ marginTop: 10 }}>
              <input type="number" min="1000" value={loanAmt} onChange={e => setLoanAmt(e.target.value)} />
              <button className="small" disabled={!reqValid} onClick={() => act({ type: 'takeLoan', amount: Number(loanAmt) })}>Borrow</button>
            </div>

            {reqLoan > 0 && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <span className="eyebrow">BORROWING PREVIEW</span>
                <div className="profile-kv"><span>Requested Amount</span><strong>{money(reqLoan)}</strong></div>
                <div className="profile-kv"><span>Interest Rate</span><strong>{estRate.toFixed(2)}% APR</strong></div>
                <div className="profile-kv"><span>Est. Hourly Interest</span><strong className="negative">-{money(reqHourlyInt)}/hr</strong></div>
                <div className="profile-kv"><span>Est. Daily Interest (24h)</span><strong className="negative">-{money(reqDailyInt)}</strong></div>
                <div className="profile-kv"><span>Total Owed After 24h</span><strong className="negative">{money(reqTotal24h)}</strong></div>
                <div className="profile-kv"><span>New Net Hourly Cash Flow</span><strong>{money(Number(fs.netHourly) - reqHourlyInt)}/hr</strong></div>
                <div className="profile-kv"><span>Remaining Credit After</span><strong>{money(Math.max(0, availCredit - reqLoan))}</strong></div>
                <div className="profile-kv"><span>Updated Total Liabilities</span><strong className="negative">{money(curDebt + reqLoan)}</strong></div>
                {reqLoan < 1000 && <p className="negative" style={{ fontSize: 12, margin: '4px 0 0' }}>Minimum loan amount is $1,000.</p>}
                {reqLoan > availCredit && <p className="negative" style={{ fontSize: 12, margin: '4px 0 0' }}>Exceeds available credit limit.</p>}
              </div>
            )}

            {(s.banking?.loans || []).map(ln => {
              const totalOwed = Number(ln.remaining || 0) + Number(ln.accruedInterest || 0);
              return (
                <div key={ln.id} className="profile-kv" style={{ marginTop: 8 }}>
                  <div>
                    <strong>Loan ({ln.rate}% APR)</strong>
                    <div className="muted" style={{ fontSize: 11 }}>Prin: {money(ln.remaining)} · Int: {money(ln.accruedInterest || 0)}</div>
                  </div>
                  <div className="line" style={{ gap: 6 }}>
                    <strong className="negative">{money(totalOwed)}</strong>
                    <button className="small" onClick={() => act({ type: 'repayLoan', target: ln.id, full: true })}>Pay Off</button>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      <section>
        <span className="eyebrow">INCOME STATEMENT</span>
        <h3>Hourly &amp; Lifetime P&amp;L</h3>
        <div className="profile-kv"><span>Gross Hourly Revenue (incl. Savings)</span><strong className="green">+{money(fs.grossRev)}/hr</strong></div>
        <div className="profile-kv"><span>Operating &amp; Loan Expenses</span><strong className="negative">-{money(fs.expenses)}/hr</strong></div>
        <div className="profile-kv"><span>Net Banking Income</span><strong className={Number(fs.netBankingHourly) >= 0 ? 'green' : 'negative'}>{Number(fs.netBankingHourly) >= 0 ? '+' : ''}{money(fs.netBankingHourly)}/hr</strong></div>
        <div className="profile-kv"><span>Total Interest Earned / Paid</span><span><b className="green">+{money(fs.interestEarned)}</b> / <b className="negative">-{money(fs.interestPaid)}</b></span></div>
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
