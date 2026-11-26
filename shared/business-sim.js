import Decimal from 'decimal.js';
import { getBusinessModel } from './business-models.js';

const D = x => new Decimal(x ?? 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function normalizeBusiness(b) {
  const m = getBusinessModel(b.type);
  const out = { ...b };
  out.level = Math.max(1, Number(out.level || 1));
  out.fleet = Number(out.fleet || 0);
  out.staff = Number(out.staff || 0);
  out.players = Number(out.players || 0);
  out.vault = Number(out.vault || 0);
  out.earned = out.earned ?? '0';
  out.history = [...(out.history || [])];
  out.statsHistory = [...(out.statsHistory || [])];
  out.upgrades = { level: out.level, infra: 1, efficiency: 1, ...(out.upgrades || {}) };
  out.upgrades.level = out.level;
  if (b.type === 'bank' && out.vault > 0 && out.upgrades.infra === 1) {
    out.upgrades.infra = 1 + out.vault;
  }
  out.upgrades.infra = Math.max(1, Number(out.upgrades.infra || 1));
  out.upgrades.efficiency = Math.max(1, Number(out.upgrades.efficiency || 1));
  out.settings = { ...(out.settings || {}) };
  for (const ctrl of m.controls) {
    if (out.settings[ctrl.key] === undefined) {
      if (ctrl.key === 'deposit' && out.deposit !== undefined) out.settings.deposit = Number(out.deposit);
      else if (ctrl.key === 'loan' && out.loan !== undefined) out.settings.loan = Number(out.loan);
      else out.settings[ctrl.key] = ctrl.def;
    }
  }
  if (b.type === 'bank') {
    out.deposit = out.settings.deposit;
    out.loan = out.settings.loan;
  }
  return out;
}

function calcBank(x, b, t) {
  const dep = Number(b.settings.deposit ?? b.deposit ?? 4.5);
  const loan = Number(b.settings.loan ?? b.loan ?? 10.5);
  const infraLv = b.upgrades.infra;
  const effLv = b.upgrades.efficiency;

  const vaultCap = 5000000 + (infraLv - 1) * 3500000 + (b.level - 1) * 1500000;
  const depDemand = clamp(0.25 + (dep - 1) * 0.14, 0.1, 1.4);
  const deposits = Math.min(vaultCap * 0.85, vaultCap * 0.55 * depDemand);
  const reserves = deposits * 0.2;
  const maxLending = Math.max(0, deposits - reserves);

  // Optimal loan rate ~9-12%; >14% craters demand & spikes default risk
  const loanDemand = clamp(1.35 - (loan - 6) * 0.09, 0.08, 1.3);
  const issuedLoans = Math.min(maxLending, maxLending * 0.92 * loanDemand);

  const effCut = Math.max(0.45, 1 - (effLv - 1) * 0.03);
  const defaultRisk = clamp((Math.max(0, loan - 11) * 0.014 + 0.008) * effCut, 0.004, 0.45);

  const scale = D(x.income).div(12000);
  const levelBoost = D(1.16).pow(b.level - 1);
  const spreadRate = Math.max(0, loan * (1 - defaultRisk * 1.4));

  // Revenue from loan interest + banking fees
  const loanRev = D(issuedLoans).times(spreadRate / 100).div(120).times(levelBoost);
  const baseFee = D(x.income).times(0.08).times(levelBoost);
  const grossRev = loanRev.plus(baseFee).times(scale.gt(1) ? 1 : 1);

  // Expenses: deposit interest + staff/branch ops + loan loss provision
  const depExpense = D(deposits).times(dep / 100).div(120).times(levelBoost);
  const opsExpense = D(x.income).times(0.04).times(levelBoost).times(effCut);
  const defaultLoss = D(issuedLoans).times(defaultRisk).div(120);
  const expenses = depExpense.plus(opsExpense).plus(defaultLoss);

  const utilization = vaultCap > 0 ? clamp((deposits / (vaultCap * 0.85)) * 100, 0, 100) : 0;
  const warnings = [];
  if (loan <= dep) warnings.push('Loan rate is at or below deposit rate — negative interest spread!');
  if (loan > 15) warnings.push('High loan rate is suppressing borrower demand and raising defaults.');
  if (dep < 2.5) warnings.push('Low deposit rate is starving the bank of lending reserves.');
  if (deposits >= vaultCap * 0.84) warnings.push('Vault near full capacity — expand Vault to accept more deposits.');

  return {
    revenue: grossRev,
    expenses,
    demand: clamp(loanDemand * 75, 5, 100),
    utilization,
    efficiency: clamp(100 - defaultRisk * 180, 15, 99),
    risk: defaultRisk * 100,
    capacityLabel: 'Vault capacity',
    capacityValue: vaultCap,
    metrics: {
      'Customer Deposits': deposits,
      'Issued Loans': issuedLoans,
      'Cash Reserves': reserves,
      'Max Lending Cap': maxLending,
      'Default Risk': `${(defaultRisk * 100).toFixed(1)}%`
    },
    warnings
  };
}

function calcGenericBusiness(x, b, m) {
  const levelMult = D(1.16).pow(b.level - 1);
  const infraLv = b.upgrades.infra;
  const effLv = b.upgrades.efficiency;
  const effBonus = 1 + (effLv - 1) * 0.06;
  const expenseCut = Math.max(0.55, 1 - (effLv - 1) * 0.025);

  const fleet = b.fleet || 0;
  const staff = b.staff || 0;
  const players = b.players || 0;

  let demand = 82;
  let utilization = 80;
  let priceFactor = 1.0;
  let costFactor = 1.0;
  let capLabel = 'Operational capacity';
  let capValue = 100 + (b.level - 1) * 40 + (infraLv - 1) * 35;
  const warnings = [];
  const metrics = {};

  if (m.kind === 'fleet') {
    const fare = Number(b.settings.fare ?? 1.0);
    const maxFleet = 6 + (infraLv - 1) * 3 + (b.level - 1) * 2;
    const totalVehicles = 1 + fleet;
    const activeDrivers = 1 + staff;
    const activeUnits = Math.min(totalVehicles, activeDrivers, maxFleet);
    demand = clamp(120 - (fare - 0.85) * 70, 15, 100);
    utilization = clamp((activeUnits / Math.max(1, totalVehicles)) * (demand / 100) * 100, 10, 100);
    priceFactor = fare * (demand / 85) * (0.85 + activeUnits * 0.16);
    costFactor = 0.34 + totalVehicles * 0.07 + activeDrivers * 0.06 + (fare > 1.5 ? 0.05 : 0);
    capLabel = 'Fleet bay cap';
    capValue = maxFleet;
    metrics['Active Units'] = `${activeUnits} / ${totalVehicles}`;
    metrics['Drivers'] = `${activeDrivers}`;
    if (totalVehicles > activeDrivers) warnings.push('Some vehicles are idle — recruit more drivers.');
    if (totalVehicles > maxFleet) warnings.push('Fleet exceeds garage bay capacity — upgrade infrastructure.');
    if (fare > 1.55) warnings.push('High pricing is hurting passenger/freight demand.');
  } else if (m.kind === 'sports') {
    const fare = Number(b.settings.fare ?? 1.0);
    const seats = 15000 + (infraLv - 1) * 5000 + (b.level - 1) * 2500;
    const teamStrength = Math.min(99, 55 + players * 4 + staff * 2 + (effLv - 1) * 2);
    demand = clamp((teamStrength / 75) * (1.25 - (fare - 0.8) * 0.55) * 75, 15, 100);
    utilization = demand;
    priceFactor = fare * (demand / 78) * (1 + players * 0.14 + staff * 0.05) * (1 + (infraLv - 1) * 0.08);
    costFactor = 0.36 + players * 0.09 + staff * 0.05;
    capLabel = 'Stadium seats';
    capValue = seats;
    metrics['Team Rating'] = `${teamStrength} OVR`;
    metrics['Attendance'] = `${Math.round(seats * (demand / 100)).toLocaleString()}`;
    if (fare > 1.6) warnings.push('High ticket prices are reducing stadium attendance.');
    if (players < 2) warnings.push('Recruit more players to boost team rating and sponsor deals.');
  } else if (m.kind === 'project') {
    const fare = Number(b.settings.fare ?? 1.05);
    const margin = Number(b.settings.margin ?? 20);
    const output = Number(b.settings.output ?? 75);
    const rateSetting = b.settings.fare !== undefined ? fare : b.settings.margin !== undefined ? 0.8 + margin / 50 : output / 75;
    const seats = 4 + (infraLv - 1) * 2 + (b.level - 1);
    const team = 1 + staff;
    const effectiveTeam = Math.min(team, seats);
    demand = clamp(115 - (rateSetting - 0.9) * 55, 20, 100);
    utilization = clamp((effectiveTeam / Math.max(1, team)) * (demand / 90) * 100, 15, 100);
    priceFactor = rateSetting * (demand / 82) * (0.9 + effectiveTeam * 0.14) * (1 + (infraLv - 1) * 0.07);
    costFactor = 0.35 + team * 0.07 + (output > 85 ? 0.1 : 0);
    capLabel = 'Team / Equipment cap';
    capValue = seats;
    metrics['Active Workforce'] = `${effectiveTeam} / ${team}`;
    if (team > seats) warnings.push('Workforce exceeds infrastructure capacity — upgrade facilities.');
    if (demand < 45) warnings.push('Aggressive pricing/bids are reducing contract wins.');
  } else {
    // Retail, Clothing, Factory, Dealership, Oil, Holding
    const markup = b.settings.markup !== undefined ? Number(b.settings.markup) : null;
    const inventory = b.settings.inventory !== undefined ? Number(b.settings.inventory) : null;
    const marketing = b.settings.marketing !== undefined ? Number(b.settings.marketing) : null;
    const output = b.settings.output !== undefined ? Number(b.settings.output) : null;

    let marginMult = 1.0;
    if (markup !== null) {
      demand = clamp(112 - (markup - 15) * 1.15, 12, 100);
      marginMult = (0.75 + markup / 55) * (demand / 82);
      if (markup > 55) warnings.push('High markup is driving customers to competitors.');
    }
    if (marketing !== null) {
      demand = clamp(demand * (0.7 + marketing / 130), 15, 100);
      costFactor += marketing * 0.0035;
      if (marketing > 80) warnings.push('Heavy marketing spend is squeezing net profit margins.');
    }
    if (inventory !== null) {
      const invRatio = inventory / 100;
      utilization = clamp(Math.min(100, invRatio * 110) * (demand / 85), 15, 100);
      marginMult *= 0.65 + invRatio * 0.45;
      costFactor += invRatio * 0.12;
      if (inventory < 40) warnings.push('Low stock level is causing missed sales.');
    } else if (output !== null) {
      const cap = 75 + (infraLv - 1) * 12;
      utilization = clamp(output, 20, 100);
      marginMult *= (output / 75) * (output > cap ? 0.85 : 1.0);
      costFactor += (output / 100) * 0.25 + (output > cap ? 0.18 : 0);
      if (output > cap) warnings.push('Running above optimal plant/refinery capacity — high maintenance!');
    } else {
      utilization = demand;
    }

    const extraCount = fleet + staff;
    priceFactor = marginMult * (1 + extraCount * 0.11) * (1 + (infraLv - 1) * 0.08);
    costFactor += 0.28 + extraCount * 0.055;
    metrics['Customer Demand'] = `${demand.toFixed(0)}%`;
  }

  const baseRevenue = D(x.income).times(1.45).times(levelMult).times(priceFactor).times(effBonus);
  const baseExpenses = D(x.income).times(costFactor).times(levelMult).times(expenseCut);

  return {
    revenue: baseRevenue,
    expenses: baseExpenses,
    demand,
    utilization,
    efficiency: clamp(75 + (effLv - 1) * 4, 40, 100),
    risk: 0,
    capacityLabel: capLabel,
    capacityValue: capValue,
    metrics,
    warnings
  };
}

export function simulateBusiness(s, rawBiz, t, c) {
  const b = normalizeBusiness(rawBiz);
  const x = c.businesses.find(item => item.id === b.type);
  if (!x) throw Error('Unknown business');
  const m = getBusinessModel(b.type);

  const sim = b.type === 'bank'
    ? calcBank(x, b, t)
    : calcGenericBusiness(x, b, m);

  // Boosters multiply REVENUE only (never expenses or losses)
  let boostMult = D(1);
  for (const q of (s.boosts || [])) {
    if (q.start <= t && q.end > t && (q.target === b.id || q.target === 'global')) {
      boostMult = boostMult.times(q.mult);
    }
  }

  const revenue = sim.revenue.times(boostMult);
  const expenses = sim.expenses;
  const netProfit = revenue.minus(expenses);
  const margin = revenue.gt(0) ? netProfit.div(revenue).times(100).toNumber() : 0;

  if (netProfit.lt(0)) {
    sim.warnings.unshift('Operating at a net loss! Adjust settings or upgrade efficiency.');
  }

  return {
    revenue: revenue.toString(),
    expenses: expenses.toString(),
    netProfit: netProfit.toString(),
    boostMult: boostMult.toNumber(),
    margin,
    demand: sim.demand,
    utilization: sim.utilization,
    efficiency: sim.efficiency,
    risk: sim.risk,
    capacityLabel: sim.capacityLabel,
    capacityValue: sim.capacityValue,
    metrics: sim.metrics,
    warnings: sim.warnings
  };
}

export function predictBusiness(s, rawBiz, settingsPatch, t, c) {
  const cloned = normalizeBusiness(rawBiz);
  cloned.settings = { ...cloned.settings, ...settingsPatch };
  if (cloned.type === 'bank') {
    cloned.deposit = cloned.settings.deposit;
    cloned.loan = cloned.settings.loan;
  }
  return simulateBusiness(s, cloned, t, c);
}

export function upgradeSpec(x, b, key) {
  const m = getBusinessModel(b.type);
  const u = m.upgrades.find(item => item.key === key) || m.upgrades[0];
  const curLv = b.upgrades?.[u.key] ?? (u.key === 'level' ? b.level : 1);
  const cost = D(x.price).times(u.baseCost).times(D(u.mult).pow(curLv - 1));
  const duration = Math.round(u.dur * (1 + (curLv - 1) * 0.35));
  return { spec: u, curLv, nextLv: curLv + 1, cost: cost.toString(), duration };
}

export function previewUpgrade(s, rawBiz, key, t, c) {
  const b = normalizeBusiness(rawBiz);
  const x = c.businesses.find(item => item.id === b.type);
  const info = upgradeSpec(x, b, key);
  const before = simulateBusiness(s, b, t, c);

  const afterBiz = normalizeBusiness(b);
  afterBiz.upgrades[info.spec.key] = info.nextLv;
  if (info.spec.key === 'level') afterBiz.level = info.nextLv;
  if (b.type === 'bank' && info.spec.key === 'infra') afterBiz.vault = info.nextLv - 1;
  const after = simulateBusiness(s, afterBiz, t, c);

  const deltaProfit = D(after.netProfit).minus(before.netProfit);
  const pctImprove = D(before.netProfit).abs().gt(0)
    ? deltaProfit.div(D(before.netProfit).abs()).times(100).toNumber()
    : 0;
  const costD = D(info.cost);
  const paybackHours = deltaProfit.gt(0) ? costD.div(deltaProfit).toNumber() : null;
  const roiPct = costD.gt(0) ? deltaProfit.div(costD).times(100).toNumber() : 0;

  return {
    ...info,
    before,
    after,
    deltaProfit: deltaProfit.toString(),
    pctImprove,
    paybackHours,
    roiPct
  };
}

export function businessValuation(rawBiz, c) {
  const b = normalizeBusiness(rawBiz);
  const x = c.businesses.find(item => item.id === b.type);
  if (!x) return '0';
  let val = D(x.price);
  val = val.plus(D(x.price).times(0.28).times(b.level - 1));
  val = val.plus(D(x.price).times(0.2).times((b.upgrades.infra - 1) + (b.upgrades.efficiency - 1)));
  val = val.plus(D(x.price).times(0.12).times((b.fleet || 0) + (b.staff || 0) + (b.players || 0)));
  return val.toString();
}
