# @tailwindcss-fluid/tailwind-merge

A [tailwind-merge](https://github.com/dcastil/tailwind-merge) v3 companion for [tailwindcss-fluid](https://github.com/jalendport/tailwindcss-fluid). The `withFluid` config extension teaches tailwind-merge to resolve conflicts between fluid utilities (`fl-p-4/8`) and their non-fluid counterparts (`p-4`), last-one-wins.

```ts
import { extendTailwindMerge } from 'tailwind-merge';
import { withFluid } from '@tailwindcss-fluid/tailwind-merge';

const twMerge = extendTailwindMerge(withFluid);
twMerge('p-4 fl-p-2/6'); // → 'fl-p-2/6'
```

It only cross-merges a fluid class when that class provably compiles to its property — the root is on the plugin's static allowlist, arbitrary endpoints fold to literal rem/px lengths, and named `fl-text` pairs pass WCAG 1.4.4 — so `fl-p-4/foo`, `fl-p-[1em]/[2em]`, `fl-opacity-50/75`, and SC-1.4.4-failing `fl-text` pairs are left alone, never deleting a real fallback. Range variants are order-sensitive. `withFluid` accepts options mirroring the plugin — `withFluid(config, { checkSC144, minScreen, maxScreen, textScale })` — so the `fl-text` merge check matches a non-default plugin config or a custom `--text-*`/`--breakpoint-*` theme.

See the [full documentation](https://github.com/jalendport/tailwindcss-fluid#tailwind-merge-companion) in the repository root.

MIT © Jalen Davenport
