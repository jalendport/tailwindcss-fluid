// README single-sourcing (M10 §9). The root README.md is canonical; npm ships the
// package's own README.md, so this copies the root over the package copy at `prepack`
// (before `pnpm pack`/publish) to keep the published docs from drifting. The package
// README is committed but GENERATED — regenerate it by running `pnpm build`'s pack
// path or this script directly; never hand-edit it.

import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'README.md');
const dest = resolve(root, 'packages/fluid-tailwind/README.md');

copyFileSync(src, dest);
console.log('copied root README.md → packages/fluid-tailwind/README.md');
