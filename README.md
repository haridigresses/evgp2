# evgp2

EV/GP₂ uses the principles of a DCF, for when you have limited time and information to model out all the assumptions. The critical inputs to a DCF are:

- revenue
- gross margin
- growth rate
- multiple
- moat / durability
- distress / risk

EV/GP₂ takes these six inputs and values a company as a multiple on its gross profit two years from now. It is the formula behind the Weighing Machine calculator at [underlinecap.com/valuation](https://underlinecap.com/valuation). The original write-up is [here](https://blog.hari.ooo/p/weighing-machine); the method has evolved since.

```
EV    = GP₂ × M × premium
GP₂   = gross profit today × growth factor over two years
value = EV + net cash
```

- **GP₂** is gross profit two years out, along a growth path that slows each year.
- **M** is the multiple for the company's category, on two-year-forward gross profit.
- **premium** is a company-level adjustment with a low–high range, e.g. for a moat or for distress.

Two years is the horizon we treat as a fair, steady-state valuation. The package accepts others: a tight market pays for about one year of growth, an inflated one for three, and any horizon from 0 to 4 years works, fractions included.

## Install

```
npm install evgp2
```

Node 22.18 or later. No runtime dependencies.

## Use

```ts
import { valuation, combinePremium, MOAT, DISTRESSED } from 'evgp2';

const v = valuation({
  revenue: 100e6,     // trailing revenue
  grossMargin: 0.7,
  growth: 1,          // current growth rate: 100%, i.e. 2× over the last year
  multiple: 6,        // category multiple on two-year-forward gross profit
  premium: combinePremium(MOAT[0], DISTRESSED[0]),  // optional; defaults to 1
  netCash: 0,         // optional
  horizon: 2,         // optional; defaults to 2
  // decay: 0.25,      // optional; your own decay constant
  // growthOverride: [0.9, 0.7],  // optional; pin next year and the year after
});

v.grossProfitForward  // ≈ $211M
v.value               // ≈ $1.27B
v.path                // growth by year: [0.81, 0.67], i.e. 81% then 67%
```

`projection` walks a scenario forward year by year and values each year under the tight, fair and inflated horizons. `ownerReturn` turns an exit value into a multiple and IRR after dilution.

## Growth

The input is the company's **current** growth rate. Year 1 is one step of decay from it, and each later year decays from the one before:

```
ln(1 + g_next) = ln(1 + g) / (1 + b · ln(1 + g)),   b = 0.25
```

| Current growth | Year 1 | Year 2 | Two-year factor |
|---|---|---|---|
| −10% | 0% | 0% | 1.00× |
| 10% | 9.8% | 9.5% | 1.20× |
| 30% | 27.9% | 26.1% | 1.61× |
| 100% | 81% | 67% | 3.02× |
| 400% (5×) | 215% | 144% | 7.7× |
| 900% (10×) | 331% | 192% | 12.6× |
| 1900% (20×) | 455% | 232% | 18.4× |

Every company sees a reversion to the mean via a decaying growth rate. Very fast growers slow quickly, while companies growing 30% barely slow down.

You are not bound to this decay. `decay` sets your own b (0 repeats the current rate every year), and `growthOverride` pins specific years, e.g. `[0.9, 0.7]` for 90% next year and 70% the year after. Years after a pinned one decay from it; `fillPath` builds a partially pinned path.

## Limits

- **Declines are not projected.** At zero or negative growth, gross profit is held flat. Holding decliners flat explained market multiples better than extending the decline, both on a 2026 cross-section and on 2016–2023 history. A decline you expect can be pinned as a year.
- A company shrinking 80% or more is outside the model, and so is growth of 50× a year or more. `isValuationInput` checks the whole domain, and `valuation` and `projection` throw a `RangeError` outside it.
- Growth of 10× or more is valued with a `hypergrowth` flag, since it is hard to forecast.

## Constants

Every coefficient lives in `src/constants.ts`: the decay rate, the horizons, the moat and distressed presets, the scenario scales and the thresholds. Each one is a hypothesis to be refitted against market data, and may change between minor versions while the package is at 0.x. Category multiples are not part of the package.

## Development

```
npm install
npm run check   # typecheck + tests
npm run build   # emits dist/
```

To release, bump `version` in `package.json`, commit, and push a matching tag (`git tag v0.1.2 && git push origin v0.1.2`). GitHub Actions runs the checks and publishes to npm through trusted publishing, with no stored token. Each release carries an npm provenance statement linking it to the commit and workflow run that built it.

## License

MIT
