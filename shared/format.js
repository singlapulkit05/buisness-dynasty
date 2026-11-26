import Decimal from 'decimal.js';

const SUFFIXES = [
    [1e33, 'Dc'], [1e30, 'No'], [1e27, 'Oc'], [1e24, 'Sp'], [1e21, 'Sx'],
    [1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M']
];

const SUFFIX_POWERS = [
    [33, 'Dc'], [30, 'No'], [27, 'Oc'], [24, 'Sp'], [21, 'Sx'],
    [18, 'Qi'], [15, 'Qa'], [12, 'T'], [9, 'B'], [6, 'M']
];

export function money(x) {
    let d;
    try {
        d = new Decimal(x ?? 0);
    } catch {
        return '$0.00';
    }
    if (!d.isFinite()) return '$0.00';
    const neg = d.isNegative();
    const abs = d.abs();
    const sign = neg ? '-' : '';

    if (abs.gte('1000000')) {
        for (const [pow, label] of SUFFIX_POWERS) {
            const divisor = Decimal.pow(10, pow);
            if (abs.gte(divisor)) {
                return `${sign}$${abs.div(divisor).toFixed(2)}${label}`;
            }
        }
        return `${sign}$${abs.toExponential(2)}`;
    }

    if (abs.gt(0) && abs.lt(1)) {
        const decimals = abs.lt('0.01') ? 6 : 4;
        return `${sign}$${abs.toFixed(decimals)}`;
    }

    const fixed = abs.toFixed(2);
    const [intPart, decPart] = fixed.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}$${withCommas}.${decPart}`;
}
