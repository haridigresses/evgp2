/**
 * EV/GP₂ — tunable constants.
 *
 * Every number here is a hypothesis, to be refitted against public-market data.
 * Model coefficients live here; nothing else in the package hard-codes one.
 */

/**
 * Growth decay, one constant for every step: ln(1+g_next) = ln(1+g) / (1 + DECAY_B · ln(1+g)).
 * The first step turns the current growth rate into year 1, so a company growing 20× now
 * projects about 5.5× next year. A hypothesis until fitted on how much of a year's growth
 * carries into the next.
 */
export const DECAY_B = 0.25;

/**
 * Market state = how many years of growth the market is paying for ("growth credit").
 * Two years is the fair, steady-state valuation: EV/GP₂. Tight and inflated are the named
 * departures from it; any non-negative number of years, fractions included, is accepted.
 */
export const FAIR_HORIZON = 2;
export const HORIZONS = { tight: 1, fair: FAIR_HORIZON, inflated: 3 } as const;
/** No market pays for more than this many years of growth; longer horizons are refused. */
export const MAX_HORIZON = 4;
export type Horizon = keyof typeof HORIZONS;
export const HORIZON_LABELS: Record<Horizon, string> = { tight: 'Tight', fair: 'Fair', inflated: 'Inflated' };

/**
 * Company-level premium: a point value and the range around it. The presets split it into a
 * moat boost and a distressed haircut that multiply (see `combinePremium`).
 */
export type Modifier = { label: string; value: number; lo: number; hi: number };
export const MOAT: readonly Modifier[] = [
  { label: 'None', value: 1.0, lo: 0.8, hi: 1.2 },
  { label: 'Clear Moat', value: 1.6, lo: 1.2, hi: 2.0 },
  { label: 'N of 1 company', value: 3.0, lo: 2.0, hi: 4.0 },
];
export const DISTRESSED: readonly Modifier[] = [
  { label: 'No', value: 1.0, lo: 1.0, hi: 1.0 },
  { label: 'Challenged', value: 0.65, lo: 0.5, hi: 0.8 },
  { label: 'Struggling', value: 0.35, lo: 0.2, hi: 0.5 },
];

/**
 * Bear / base / bull scale the projected growth path; margin is never varied (it is linear,
 * and a seed margin should not move silently). Placeholders until fitted.
 */
export const SCENARIO_SCALE = { bear: 0.6, base: 1, bull: 1.2 } as const;
export type ScenarioKey = keyof typeof SCENARIO_SCALE;

/**
 * Decline thresholds, applied to the entered growth rate and to every projected year. Shrinking
 * faster than RAPID_DECLINE gets a note; shrinking by UNVALUABLE_DECLINE or more is not valued
 * (headline) or not projected (a scenario year).
 */
export const RAPID_DECLINE = -0.2;
export const UNVALUABLE_DECLINE = -0.8;
export const RAPID_DECLINE_NOTE =
  'This company is in rapid decline, which makes it hard to forecast, so the model may be less accurate than usual.';
export const UNVALUABLE_DECLINE_NOTE = 'This company is declining too fast to value.';

/** Growth at or above this (1+g) is flagged as too fast to model reliably. */
export const HYPERGROWTH_FACTOR = 10;
export const HYPERGROWTH_NOTE =
  'Growth this fast is unsustainable and hence hard to model / value, so the model may be less accurate than usual.';

/** Growth of this many times a year (1+g) or more is outside the model: not valued, projected or solved for. */
export const MAX_GROWTH_FACTOR = 50;
export const MAX_GROWTH_NOTE = 'This model does not value growth of 50× a year or more.';

