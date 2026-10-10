import { HORIZONS, type Horizon } from './constants.ts';
import { compound, growthPath, isGrowthRate, isModeledGrowth } from './growth.ts';
import { isMargin, valuation, type ValuationInput } from './valuation.ts';

/**
 * Scenarios: walk a growth path to an exit year, then apply the same forward valuation
 * from each year under each market cycle (tight / fair / inflated). `ownerReturn` turns an exit value into a multiple and IRR against an
 * entry price, after cumulative dilution; the equity bridge is net cash.
 */
export type Scenario = {
  path: readonly number[];    // growth by year from today (year 1 first); decay continues past its end
  margin: number;             // gross margin assumed for every projected year, 0..1
};

export type ProjectionYear = {
  year: number;
  growth: number;             // that year's growth
  revenue: number;            // revenue at end of that year
  grossProfit: number;
  byHorizon: Record<Horizon, number>;   // valuation (ev + net cash) at that year under each market state
};


/** The growth domain, enforced at the engine boundary: nothing shrinking 80% or more, or growing 50× or more, is projected. */
function assertProjectable(input: ValuationInput, scenario: Scenario): void {
  if (!isModeledGrowth(input.growth) || !scenario.path.every(isModeledGrowth)) {
    throw new RangeError('a year shrinking 80% or more, or growing 50× or more, is not projected');
  }
}

/** Revenue and value, year by year, for `years` years (the page shows three). */
export function projection(input: ValuationInput, scenario: Scenario, years: number = 3): ProjectionYear[] {
  if (!Number.isInteger(years) || years < 1) throw new RangeError(`years must be a positive integer, got ${years}`);
  if (!isMargin(scenario.margin)) throw new RangeError(`scenario margin must be in (0, 1], got ${scenario.margin}`);
  if (!scenario.path.every(isGrowthRate)) throw new RangeError('scenario growth rates must be finite and above -100%');
  assertProjectable(input, scenario);
  const horizons = Object.keys(HORIZONS) as Horizon[];
  const longest = years + Math.max(...Object.values(HORIZONS));
  const path = growthPath(input.growth, longest, scenario.path);
  const out: ProjectionYear[] = [];
  for (let y = 1; y <= years; y++) {
    const revenue = input.revenue * compound(path.slice(0, y));
    const byHorizon = {} as Record<Horizon, number>;
    for (const horizon of horizons) {
      // growth from year y onward, as seen from that year
      const forward = path.slice(y, y + HORIZONS[horizon]);
      byHorizon[horizon] = valuation({
        ...input, revenue, grossMargin: scenario.margin, growth: forward[0], growthOverride: forward, horizon: HORIZONS[horizon],
      }).value;
    }
    out.push({ year: y, growth: path[y - 1], revenue, grossProfit: revenue * scenario.margin, byHorizon });
  }
  return out;
}

/**
 * What the holder of a stake bought at `entry` makes when the company is worth `exitValue`,
 * after `dilution`: the cumulative share given up by exit to fundraising or stock-based
 * compensation, in [0, 1).
 */
export function ownerReturn(exitValue: number, entry: number, dilution: number, years: number): { multiple: number; irr: number } {
  if (!(entry > 0)) throw new RangeError(`entry must be positive, got ${entry}`);
  if (!(dilution >= 0 && dilution < 1)) throw new RangeError(`dilution must be in [0, 1), got ${dilution}`);
  const multiple = exitValue * (1 - dilution) / entry;
  return { multiple, irr: irr(multiple, years) };
}

/** Annualized return for a multiple on money. A total loss is −100%; a negative exit value has no IRR (NaN). */
export function irr(multiple: number, years: number): number {
  return multiple > 0 ? Math.pow(multiple, 1 / years) - 1 : multiple === 0 ? -1 : NaN;
}

