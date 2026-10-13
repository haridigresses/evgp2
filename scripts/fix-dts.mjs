// tsc rewrites `.ts` import extensions in emitted JS but not in declarations, so point the
// .d.ts files at their .js siblings for consumers whose TypeScript resolves them literally.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

for (const name of readdirSync('dist').filter(f => f.endsWith('.d.ts'))) {
  const file = `dist/${name}`;
  writeFileSync(file, readFileSync(file, 'utf8').replace(/(from '\.\/[^']+)\.ts'/g, "$1.js'"));
}
