import { DECAY_B, FAIR_HORIZON, HYPERGROWTH_FACTOR, MAX_HORIZON, type Modifier } from './constants.ts';
import { compound, declineStatus, growthPath, isModeledGrowth } from './growth.ts';

export type Premium = { value: number; lo: number; hi: number };

/**
 * EV = GP_forward × M × premium, where GP_forward is gross profit `horizon` years ahead along a
 * decaying growth path. Two years is the fair, steady-state case: "a multiple on two-year-forward
 * gross profit", EV/GP₂.
 */
export type ValuationInput = {
  revenue: number;
  grossMargin: number;        // 0..1
  growth: number;             // current (last-year) growth, as a decimal; year 1 decays from it
  multiple: number;           // category multiple on forward gross profit (M)
  premium?: Premium;          // company premium and its range; default 1 with no range
  netCash?: number;
  horizon?: number;           // years of growth the market pays for, 0..MAX_HORIZON; default FAIR_HORIZON (2)
  growthOverride?: readonly number[]; // explicit year-by-year path (scenario)
  decay?: number;             // decay constant b for open years, ≥ 0; default DECAY_B (0 = no decay)
};

export type Valuation = {
  grossProfit: number;
  years: number;              // the horizon, possibly fractional
  path: number[];             // growth by year, length = ⌈years⌉
  growthTerm: number;         // Π(1+g_y) over the horizon, the last partial year pro rata in log terms
  grossProfitForward: number;
  multiple: number;
  premium: number;
  ev: number;
  evLow: number;
  evHigh: number;
  netCash: number;
  value: number;              // ev + net cash: valuation / market cap
  valueLow: number;
  valueHigh: number;
  /** EV ÷ today's gross profit — the familiar trailing multiple, derived. */
  trailingMultiple: number;
  hypergrowth: boolean;
  rapidDecline: boolean;
};

export const NO_PREMIUM: Premium = { value: 1, lo: 1, hi: 1 };

/** Premium presets multiply: a moat boost and a distressed haircut combine into one premium. */
export function combinePremium(...modifiers: readonly Modifier[]): Premium {
  return modifiers.reduce((p, m) => ({ value: p.value * m.value, lo: p.lo * m.lo, hi: p.hi * m.hi }), NO_PREMIUM);
}

export function grossProfit(revenue: number, grossMargin: number): number {
  return revenue * grossMargin;
}

/**
 * Growth factor over `years` of a path: whole years compound, and a final partial year counts
 * as that fraction of its growth in log terms, (1+g)^f. 2.5 years = (1+g₁)(1+g₂)(1+g₃)^0.5.
 */
export function growthFactor(path: readonly number[], years: number): number {
  if (!isHorizon(years)) throw new RangeError(`years must be in [0, ${MAX_HORIZON}], got ${years}`);
  if (path.length < Math.ceil(years)) throw new RangeError(`a ${years}-year factor needs ${Math.ceil(years)} years of path, got ${path.length}`);
  const whole = Math.floor(years);
  const part = years - whole;
  const factor = compound(path.slice(0, whole));
  return part > 0 ? factor * Math.pow(1 + path[whole], part) : factor;
}

/** Value a company. Throws a RangeError on anything `isValuationInput` refuses. */
export function valuation(input: ValuationInput): Valuation {
  if (!isValuationInput(input)) throw new RangeError('input is outside the model: see isValuationInput');
  const years = input.horizon ?? FAIR_HORIZON;
  const gp = grossProfit(input.revenue, input.grossMargin);
  const path = growthPath(input.growth, Math.ceil(years), input.growthOverride ?? [], input.decay ?? DECAY_B);
  const growthTerm = growthFactor(path, years);
  const gpForward = gp * growthTerm;
  const p = input.premium ?? NO_PREMIUM;
  const base = gpForward * input.multiple;
  const ev = base * p.value;
  const evLow = base * p.lo;
  const evHigh = base * p.hi;
  const netCash = input.netCash ?? 0;
  return {
    grossProfit: gp, years, path, growthTerm, grossProfitForward: gpForward,
    multiple: input.multiple, premium: p.value, ev, evLow, evHigh, netCash,
    value: ev + netCash, valueLow: evLow + netCash, valueHigh: evHigh + netCash,
    trailingMultiple: gp > 0 ? ev / gp : NaN,
    hypergrowth: 1 + input.growth >= HYPERGROWTH_FACTOR,
    rapidDecline: declineStatus(input.growth) === 'rapid',
  };
}

/** A gross margin the model can reason about: in (0, 1]. */
export function isMargin(m: unknown): m is number {
  return typeof m === 'number' && Number.isFinite(m) && m > 0 && m <= 1;
}

/** A horizon the model can reason about: zero (today's GP) up to MAX_HORIZON years, fractions included. */
export function isHorizon(h: unknown): h is number {
  return typeof h === 'number' && Number.isFinite(h) && h >= 0 && h <= MAX_HORIZON;
}

/** A premium the model can reason about: positive, with lo ≤ value ≤ hi. */
export function isPremium(p: unknown): p is Premium {
  if (typeof p !== 'object' || p === null) return false;
  const { value, lo, hi } = p as Premium;
  return [value, lo, hi].every(x => typeof x === 'number' && Number.isFinite(x)) && lo > 0 && lo <= value && value <= hi;
}

/**
 * The numeric domain the formula is valid on. Outside it a "valuation" would be an artifact
 * (two negative growth factors multiply to a positive number), so callers show nothing instead.
 */
export function isValuationInput(input: Partial<ValuationInput>): input is ValuationInput {
  return Number.isFinite(input.revenue) && (input.revenue as number) > 0
    && isMargin(input.grossMargin)
    && isModeledGrowth(input.growth)
    && (input.growthOverride == null || input.growthOverride.every(isModeledGrowth))
    && Number.isFinite(input.multiple) && (input.multiple as number) > 0
    && (input.premium == null || isPremium(input.premium))
    && (input.horizon == null || isHorizon(input.horizon))
    && (input.decay == null || (Number.isFinite(input.decay) && input.decay >= 0))
    && (input.netCash == null || Number.isFinite(input.netCash));
}
