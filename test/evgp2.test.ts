import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISTRESSED, FAIR_HORIZON, HORIZONS, MAX_HORIZON, MOAT, NO_PREMIUM, isPremium, SCENARIO_SCALE, combinePremium, compound, fillPath, isGrowthRate, scenarioGrowth,
  declineStatus, pathDeclineStatus, growthFactor, growthPath, irr, isValuationInput, ownerReturn, nextGrowth, projection, valuation,
} from '../src/index.ts';

const within = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${label}: ${actual} not within ${tolerance * 100}% of ${expected}`);
const moat = combinePremium(MOAT[1], DISTRESSED[0]);  // Clear Moat, not distressed
assert.equal(MOAT[1].label, 'Clear Moat');

test('growth decays logarithmically: 2× → 1.8×, 5× → 3.15×, 10× → 4.3×, 20× → 5.5×, gently at ordinary rates', () => {
  within(1 + nextGrowth(1.0), 1.805, 0.005, '100%');
  within(1 + nextGrowth(4.0), 3.15, 0.005, '400%');
  within(1 + nextGrowth(9.0), 4.31, 0.005, '900%');
  within(1 + nextGrowth(19), 5.55, 0.005, '1900%');
  within(nextGrowth(0.30), 0.279, 0.01, '30%');
  within(nextGrowth(0.10), 0.0976, 0.01, '10%');
  assert.equal(nextGrowth(0), 0);
  assert.equal(nextGrowth(-0.4), 0, 'after a shrinking year, gross profit is held flat');
});

test('a growth path decays once from last year\'s rate, honours an explicit scenario, then keeps decaying', () => {
  const free = growthPath(0.82, 4);
  within(free[0], nextGrowth(0.82), 1e-9, 'year 1 is one step of decay from the current rate');
  within(1 + growthPath(19, 1)[0], 5.55, 0.01, 'a 20× year projects about 5.5× next');
  assert.ok(free[1] < free[0] && free[2] < free[1] && free[3] < free[2]);
  const pinned = growthPath(0.8, 5, [0.70, 0.60, 0.50]);
  assert.deepEqual(pinned.slice(0, 3), [0.70, 0.60, 0.50]);
  assert.ok(pinned[3] < 0.50 && pinned[4] < pinned[3]);
  within(compound([0.2, 0.2]), 1.44, 1e-9, 'compound');
});

test('Datadog stays within 5% of the live Weighing Machine v1 (same category multiple)', () => {
  // v1's inputs as of 2025-08-18, fixed here so the regression survives seed refreshes.
  const ddog = { revenue: 3016056000, margin: 0.7992, growth: 0.26, netCash: 2646543000 };
  const multiple = 7.08;  // the Developer & Infrastructure Software category multiple
  const v = valuation({ revenue: ddog.revenue, grossMargin: ddog.margin, growth: ddog.growth, multiple, premium: moat, netCash: ddog.netCash });
  // The live site squares last year's 26% ($43.4B EV); v2 decays it to 24% then 23%, about 4% lower.
  within(v.ev, 41.5e9, 0.01, 'EV');
  within(v.ev, 43.4e9, 0.05, 'EV against the live site');
  within(v.value, 44.2e9, 0.01, 'equity');
  within(v.multiple * v.growthTerm, 10.77, 0.01, 'multiple × growth term');
  within(v.trailingMultiple, 10.77 * 1.6, 0.01, 'EV ÷ trailing GP');
  assert.equal(v.years, 2);
  assert.equal(v.hypergrowth, false);
  assert.ok(v.valueLow < v.value && v.value < v.valueHigh);
});

test('a pinned scenario projects revenue and values each year on the growth still ahead of it', () => {
  const input = { revenue: 1e9, grossMargin: 0.8, growth: 0.8, multiple: 5, netCash: 0 };
  const [y1, y2, y3] = projection(input, { path: [0.70, 0.60, 0.50], margin: 0.8 });
  within(y1.revenue, 1.7e9, 1e-12, 'year 1 revenue');
  within(y2.revenue, 2.72e9, 1e-12, 'year 2 revenue');
  within(y3.revenue, 4.08e9, 1e-12, 'year 3 revenue');
  within(y1.byHorizon.fair, 1.7e9 * 0.8 * 1.6 * 1.5 * 5, 1e-12, 'year 1, fair: GP × the next two pinned years × M');
  within(y1.byHorizon.tight, 1.7e9 * 0.8 * 1.6 * 5, 1e-12, 'year 1, tight: one year ahead');
  assert.ok(y1.byHorizon.tight < y1.byHorizon.fair && y1.byHorizon.fair < y1.byHorizon.inflated);
  within(y2.byHorizon.tight, y1.byHorizon.fair, 1e-12, 'a year later, one year ahead covers the same growth as two years ahead did');
  const r = ownerReturn(y3.byHorizon.fair, 10e9, 0, 3);
  within(r.multiple, y3.byHorizon.fair / 10e9, 1e-12, 'multiple on entry');
  within(r.irr, Math.cbrt(r.multiple) - 1, 1e-12, 'IRR over three years');
});

test('hypergrowth is flagged at 10× and above and valued up to 50×', () => {
  const input = { revenue: 1e6, grossMargin: 0.8, growth: 9.5, multiple: 5 };
  const v = valuation(input);
  assert.equal(v.hypergrowth, true);
  assert.ok(v.growthTerm > 10, 'uncapped');
  assert.equal(valuation({ ...input, growth: 8.5 }).hypergrowth, false);
});

test('projection refuses a bad year count or margin', () => {
  const input = { revenue: 10e6, grossMargin: 0.8, growth: 0.3, multiple: 5, netCash: 1e6 };
  const scenario = { path: [0.3, 0.25], margin: 0.8 };
  assert.throws(() => projection(input, scenario, 0), RangeError);
  assert.throws(() => projection(input, { ...scenario, margin: 0 }), RangeError);
});

test('the model stops at 50× a year and at an 80% decline, for the entered rate and every override', () => {
  const input = { revenue: 10e6, grossMargin: 0.8, growth: 0.3, multiple: 5, netCash: 0 };
  assert.equal(isValuationInput({ ...input, growth: 48.9 }), true);
  assert.equal(isValuationInput({ ...input, growth: 49 }), false, '50× a year is outside the model');
  assert.equal(isValuationInput({ ...input, growthOverride: [0.3, -0.85] }), false, 'an override past −80% is refused');
  assert.equal(isValuationInput({ ...input, growthOverride: [0.3, 60] }), false, 'an override at 50× or more is refused');
  assert.throws(() => projection(input, { path: [60], margin: 0.8 }), RangeError);
});

test('IRR: a total loss is −100%, a negative exit value has none', () => {
  assert.equal(irr(0, 2), -1);
  assert.ok(Number.isNaN(irr(-0.4, 2)));
  within(irr(4, 2), 1, 1e-12, '4× over two years');
});

test('dilution takes its share of the exit before the multiple and IRR', () => {
  const r = ownerReturn(4e9, 1e9, 0.2, 2);
  within(r.multiple, 3.2, 1e-12, '4× less a fifth');
  within(r.irr, Math.sqrt(3.2) - 1, 1e-12, 'IRR on the diluted multiple');
  assert.equal(ownerReturn(4e9, 1e9, 0, 2).multiple, 4);
  assert.throws(() => ownerReturn(4e9, 1e9, 1, 2), RangeError, 'all of it is not dilution');
  assert.throws(() => ownerReturn(4e9, 1e9, -0.1, 2), RangeError);
  assert.throws(() => ownerReturn(4e9, 0, 0.1, 2), RangeError);
});

test('the formula refuses its own artifacts: growth at or below -100% and margins outside (0, 1] are not inputs', () => {
  const ok = { revenue: 1e8, grossMargin: 0.6, growth: 0.2, multiple: 5 };
  assert.equal(isValuationInput(ok), true);
  assert.equal(isValuationInput({ ...ok, growth: -2 }), false, '-200% growth would square to a positive factor');
  assert.equal(isValuationInput({ ...ok, growth: -1 }), false);
  assert.equal(isValuationInput({ ...ok, grossMargin: 1.2 }), false);
  assert.equal(isValuationInput({ ...ok, grossMargin: 0 }), false);
  assert.equal(isValuationInput({ ...ok, growthOverride: [0.3, -1.5] }), false, 'scenario years are checked too');
  assert.equal(isValuationInput({ ...ok, growth: -0.4, grossMargin: 1 }), true, 'a shrinking company at 100% margin is fine');
  assert.throws(() => projection(ok, { path: [-2], margin: 0.6 }), RangeError);
  assert.throws(() => projection(ok, { path: [0.2], margin: 1.5 }), RangeError);
});

test('an edited scenario year pins that year and the years after it decay from it', () => {
  const free = fillPath(0.30, [null, null, null]);
  assert.deepEqual(free, growthPath(0.30, 3));
  const edited = fillPath(0.30, [1.0, null, null]);
  assert.equal(edited[0], 1.0);
  within(edited[1], nextGrowth(1.0), 1e-9, 'year 2 decays from the edited 100%, not from 30%');
  within(edited[2], nextGrowth(nextGrowth(1.0)), 1e-9, 'year 3 continues');
  const mid = fillPath(0.30, [null, 0.5, null]);
  within(mid[0], nextGrowth(0.30), 1e-9, 'an open year 1 decays from the current rate'); assert.equal(mid[1], 0.5); within(mid[2], nextGrowth(0.5), 1e-9, 'decay resumes from the pinned year');
  assert.deepEqual(Object.keys(SCENARIO_SCALE), ['bear', 'base', 'bull']);
});

test('bear and bull move growth apart; a shrinking company starts flat in every scenario', () => {
  within(scenarioGrowth(0.5, 'bull'), 0.6, 1e-9, 'bull adds to growth');
  within(scenarioGrowth(0.5, 'bear'), 0.3, 1e-9, 'bear trims growth');
  for (const k of ['bear', 'base', 'bull'] as const) {
    assert.equal(scenarioGrowth(-0.05, k), 0, `${k}: a decline is not projected`);
    assert.equal(scenarioGrowth(0, k), 0);
  }
});

test('declines are not projected: a shrinking company keeps today\'s gross profit unless a year is pinned', () => {
  const input = { revenue: 10e9, grossMargin: 0.4, growth: -0.3, multiple: 4, netCash: 0 };
  const v = valuation(input);
  assert.deepEqual(v.path, [0, 0]);
  assert.equal(v.grossProfitForward, v.grossProfit, 'two-year-forward GP equals today\'s');
  assert.equal(v.rapidDecline, true, 'the entered rate still carries the rapid-decline note');
  assert.deepEqual(growthPath(-0.1, 3), [0, 0, 0]);
  assert.deepEqual(fillPath(-0.1, [null, null, null]), [0, 0, 0]);
  const pinned = fillPath(0.2, [-0.25, null, null]);
  assert.equal(pinned[0], -0.25, 'a typed decline is honoured');
  assert.deepEqual(pinned.slice(1), [0, 0], 'and the years after it are flat');
  assert.deepEqual(growthPath(0.2, 3, [-0.25]), [-0.25, 0, 0]);
});

test('decline thresholds: a note past -20%, no valuation at -80% or worse', () => {
  assert.equal(declineStatus(-0.1), 'ok');
  assert.equal(declineStatus(-0.2), 'ok');
  assert.equal(declineStatus(-0.25), 'rapid');
  assert.equal(declineStatus(-0.8), 'unvaluable');
  const base = { revenue: 1e9, grossMargin: 0.4, multiple: 3 };
  assert.equal(valuation({ ...base, growth: -0.3 }).rapidDecline, true);
  assert.equal(valuation({ ...base, growth: -0.1 }).rapidDecline, false);
  assert.equal(isValuationInput({ ...base, growth: -0.79 }), true);
  assert.equal(isValuationInput({ ...base, growth: -0.8 }), false, 'declining 80% or more is not valued');
});

test('the decline policy applies to every projected year, not only the entered rate', () => {
  assert.deepEqual(pathDeclineStatus([0.3, 0.25, 0.2]), { unvaluableYear: null, rapid: false });
  assert.deepEqual(pathDeclineStatus([0.3, -0.3, 0.2]), { unvaluableYear: null, rapid: true });
  assert.deepEqual(pathDeclineStatus([0.3, -0.9, -0.3]), { unvaluableYear: 2, rapid: true });
  assert.deepEqual(pathDeclineStatus([-0.8]), { unvaluableYear: 1, rapid: false });
  assert.equal(pathDeclineStatus([-0.2]).rapid, false, 'exactly −20% is not rapid');
});

test('the engine itself refuses to project a year shrinking 80% or more', () => {
  const input = { revenue: 1e9, grossMargin: 0.5, growth: 0.2, multiple: 5, netCash: 0 };
  assert.throws(() => projection(input, { path: [-0.9], margin: 0.5 }), RangeError);
  assert.throws(() => projection(input, { path: [0.2, -0.8], margin: 0.5 }), RangeError);
  assert.throws(() => projection({ ...input, growth: -0.85 }, { path: [], margin: 0.5 }), RangeError);
  assert.doesNotThrow(() => projection(input, { path: [-0.79], margin: 0.5 }));
});

test('the horizon defaults to two years, the fair steady state, and accepts any number of years', () => {
  const input = { revenue: 100e6, grossMargin: 0.8, growth: 0.5, multiple: 5 };
  const fair = valuation(input);
  assert.equal(FAIR_HORIZON, 2);
  assert.equal(HORIZONS.fair, FAIR_HORIZON);
  assert.equal(fair.years, 2);
  assert.equal(fair.ev, valuation({ ...input, horizon: 2 }).ev);
  assert.equal(valuation({ ...input, horizon: 0 }).grossProfitForward, 80e6, 'zero years is today\'s gross profit');
  const half = valuation({ ...input, horizon: 2.5 });
  assert.equal(half.path.length, 3);
  within(half.growthTerm, (1 + half.path[0]) * (1 + half.path[1]) * Math.sqrt(1 + half.path[2]), 1e-12, 'a half year counts as the square root of its factor');
  assert.ok(fair.ev < half.ev && half.ev < valuation({ ...input, horizon: 3 }).ev, 'value rises smoothly with the horizon');
  within(growthFactor([0.2, 0.1], 1.5), 1.2 * Math.sqrt(1.1), 1e-12, 'growthFactor');
  assert.throws(() => valuation({ ...input, horizon: -1 }), RangeError);
  assert.throws(() => valuation({ ...input, horizon: Infinity }), RangeError);
  assert.equal(isValuationInput({ ...input, horizon: -0.5 }), false);
  assert.equal(isValuationInput({ ...input, horizon: 1.75 }), true);
});

test('the premium is one input with a range; moat and distressed presets multiply into it', () => {
  const input = { revenue: 100e6, grossMargin: 0.8, growth: 0.3, multiple: 5 };
  const plain = valuation(input);
  assert.equal(plain.premium, 1);
  assert.equal(plain.evLow, plain.ev);
  assert.equal(plain.evHigh, plain.ev);
  const p = combinePremium(MOAT[1], DISTRESSED[1]);
  within(p.value, 1.6 * 0.65, 1e-12, 'value');
  within(p.lo, 1.2 * 0.5, 1e-12, 'lo');
  within(p.hi, 2.0 * 0.8, 1e-12, 'hi');
  const v = valuation({ ...input, premium: p });
  within(v.ev, plain.ev * p.value, 1e-12, 'EV scales by the premium');
  within(v.evLow, plain.ev * p.lo, 1e-12, 'low end');
  assert.deepEqual(combinePremium(), NO_PREMIUM);
  assert.equal(isValuationInput({ ...input, premium: { value: 1, lo: 1.2, hi: 2 } }), false, 'value below its range');
  assert.equal(isValuationInput({ ...input, premium: { value: 0, lo: 0, hi: 0 } }), false, 'a zero premium');
});

test('horizon edges: fractions under a year, the 4-year cap, and a pinned decline over a partial year', () => {
  const input = { revenue: 100e6, grossMargin: 0.8, growth: 0.5, multiple: 5 };
  const q = valuation({ ...input, horizon: 0.25 });
  within(q.growthTerm, Math.pow(1 + q.path[0], 0.25), 1e-12, 'a quarter year');
  assert.equal(MAX_HORIZON, 4);
  assert.doesNotThrow(() => valuation({ ...input, horizon: MAX_HORIZON }));
  assert.throws(() => valuation({ ...input, horizon: 4.01 }), RangeError, 'past four years is refused');
  assert.throws(() => valuation({ ...input, horizon: 1e9 }), RangeError, 'a billion years is refused, not allocated');
  within(valuation({ ...input, horizon: 1.5, growthOverride: [-0.5] }).growthTerm, 0.5, 1e-12, 'a pinned −50% then a flat half year');
  assert.throws(() => growthFactor([0.1], 1.5), RangeError, 'too short a path');
});

test('valuation throws outside the domain isValuationInput describes', () => {
  const input = { revenue: 100e6, grossMargin: 0.8, growth: 0.5, multiple: 5 };
  assert.throws(() => valuation({ ...input, growth: -0.9 }), RangeError);
  assert.throws(() => valuation({ ...input, growth: 60 }), RangeError);
  assert.throws(() => valuation({ ...input, grossMargin: 0 }), RangeError);
  assert.throws(() => valuation({ ...input, premium: { value: 1, lo: 0, hi: 1 } }), RangeError);
  for (const bad of [null, 1, { value: NaN, lo: 1, hi: 1 }, { value: 1, lo: 0, hi: 1 }, { value: 2, lo: 1, hi: 1.5 }]) {
    assert.equal(isPremium(bad), false, JSON.stringify(bad));
  }
  assert.equal(isPremium({ value: 1, lo: 0.8, hi: 1.2 }), true);
});

test('a caller can set its own decay constant, or pin years and skip decay entirely', () => {
  const input = { revenue: 100e6, grossMargin: 0.8, growth: 1, multiple: 5 };
  assert.deepEqual(valuation(input).path, growthPath(1, 2));
  assert.deepEqual(valuation({ ...input, decay: 0.1 }).path, growthPath(1, 2, [], 0.1));
  assert.deepEqual(valuation({ ...input, decay: 0 }).path, [1, 1], 'no decay repeats the current rate');
  assert.ok(valuation({ ...input, decay: 0.1 }).ev > valuation(input).ev, 'gentler decay, higher value');
  assert.deepEqual(valuation({ ...input, growthOverride: [0.9, 0.7] }).path, [0.9, 0.7], 'pinned years are used as given');
  assert.throws(() => valuation({ ...input, decay: -0.1 }), RangeError);
  assert.equal(isValuationInput({ ...input, decay: NaN }), false);
});
