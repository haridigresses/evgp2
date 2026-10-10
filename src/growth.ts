import { DECAY_B, MAX_GROWTH_FACTOR, RAPID_DECLINE, SCENARIO_SCALE, UNVALUABLE_DECLINE, type ScenarioKey } from './constants.ts';

/**
 * Next year's growth rate, given this year's. Logarithmic decay:
 *   ln(1+g') = ln(1+g) / (1 + b · ln(1+g))
 * At b = 0.25: 100% → 81%, 400% → 215% (5× → 3.15×), 900% → 331% (10× → 4.3×),
 * 1900% → 455% (20× → 5.5×); 30% → 28%.
 *
 * Decay describes fading growth, not decline. Declines are not projected: after a year of zero
 * or negative growth, gross profit is held flat. Tested on a 2026-09 cross-section of 1,932
 * companies and on 2016–2023 history, holding a decliner's gross profit flat explained multiples
 * better than extending the decline. A decline the reader expects is typed in as a pinned year.
 */
export function nextGrowth(g: number, b: number = DECAY_B): number {
  if (!(g > 0)) return 0;
  const x = Math.log1p(g);
  return Math.expm1(x / (1 + b * x));
}

/**
 * A growth path for `years` years. `given` pins the first years explicitly
 * (a scenario); the rest continue the decay from the last given rate.
 * The entered rate is the current growth rate, so year 1 is one step of decay from it:
 * a 20× year projects about 5.5× next. A zero or negative rate starts flat: declines are not projected.
 */
export function growthPath(g: number, years: number, given: readonly number[] = [], b: number = DECAY_B): number[] {
  const path: number[] = [];
  let current = g;
  for (let y = 0; y < years; y++) {
    current = y < given.length ? given[y] : nextGrowth(y === 0 ? g : current, b);
    path.push(current);
  }
  return path;
}

/** A growth rate the model can reason about: finite and above −100% (revenue cannot go negative). */
export function isGrowthRate(g: unknown): g is number {
  return typeof g === 'number' && Number.isFinite(g) && g > -1;
}

/** A rate the model will value or project: above UNVALUABLE_DECLINE and below MAX_GROWTH_FACTOR× a year. */
export function isModeledGrowth(g: unknown): g is number {
  return isGrowthRate(g) && g > UNVALUABLE_DECLINE && 1 + g < MAX_GROWTH_FACTOR;
}

/**
 * Fill a partially pinned path: a pinned year is taken as given; an open year decays from the
 * year before it (year 1 decays from the current rate `g`). This is how an edited scenario keeps its
 * "everything after what you typed follows the decay" meaning.
 */
export function fillPath(g: number, pinned: readonly (number | null | undefined)[], b: number = DECAY_B): number[] {
  const out: number[] = [];
  for (let y = 0; y < pinned.length; y++) {
    const given = pinned[y];
    out.push(given != null ? given : nextGrowth(y === 0 ? g : out[y - 1], b));
  }
  return out;
}

/**
 * A scenario's starting growth: Bear trims growth and Bull adds to it. A shrinking company's
 * scenarios all start flat, because declines are not projected (see nextGrowth).
 */
export function scenarioGrowth(g: number, scenario: ScenarioKey): number {
  return g > 0 ? g * SCENARIO_SCALE[scenario] : 0;
}

/** How a growth rate reads for decline: fine, rapid (valued with a note), or not valuable at all. */
export function declineStatus(g: number): 'ok' | 'rapid' | 'unvaluable' {
  if (g <= UNVALUABLE_DECLINE) return 'unvaluable';
  if (g < RAPID_DECLINE) return 'rapid';
  return 'ok';
}

/**
 * The decline policy applied to a projected path, year by year: the first year shrinking by
 * UNVALUABLE_DECLINE or more (not projected), and whether any year is in rapid decline.
 */
export function pathDeclineStatus(path: readonly number[]): { unvaluableYear: number | null; rapid: boolean } {
  const i = path.findIndex(g => declineStatus(g) === 'unvaluable');
  return { unvaluableYear: i >= 0 ? i + 1 : null, rapid: path.some(g => declineStatus(g) === 'rapid') };
}

/** Cumulative growth factor over a path: Π(1+g_y). */
export function compound(path: readonly number[]): number {
  return path.reduce((acc, g) => acc * (1 + g), 1);
}
