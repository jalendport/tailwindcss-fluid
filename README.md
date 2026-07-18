<h1 align="center">@jalendport/tailwindcss-fluid</h1>
<p align="center"><em>Fluid clamp() utilities and range variants for Tailwind CSS v4.</em></p>

Fluid utilities interpolate a CSS value between two endpoints as the viewport (or a container) grows, emitting a `clamp()` so the value scales smoothly instead of jumping at breakpoints. Write the start and end on either side of a slash — `fl-text-base/4xl` ramps font-size from the `base` size up to the `4xl` size across the default range, and clamps at both ends.

```html
<h1 class="fl-text-base/4xl">Fluidly scaled type</h1>
<div class="fl-p-4/8 fl-gap-2/6">Padding and gap grow with the viewport</div>
<div class="fl-md/lg:fl-text-base/4xl">Interpolate only across the md→lg range</div>
```

## Status

**Not yet on npm.** The package is feature-complete and tested; the first published release will be `1.0.0-beta.1` under the name `@jalendport/tailwindcss-fluid`. Until it's live, install from the repository. The class grammar below is stable.

## Installation

Install the package (once published) and load the plugin through Tailwind v4's `@plugin` directive in your CSS. It requires `tailwindcss@^4.3` (a peer dependency).

```sh
pnpm add -D @jalendport/tailwindcss-fluid
```

```css
@import 'tailwindcss';
@plugin "@jalendport/tailwindcss-fluid";
```

Options are passed in a block. All are optional:

```css
@import 'tailwindcss';
@plugin "@jalendport/tailwindcss-fluid" {
	min-screen: 20rem; /* start of the default viewport range (default: smallest --breakpoint-*, 40rem) */
	max-screen: 80rem; /* end of the default viewport range   (default: largest  --breakpoint-*, 96rem) */
	checkSC144: false; /* opt out of the WCAG 1.4.4 zoom-safety check (default: on) */
}
```

## Class grammar reference

A fluid class is a core-utility root prefixed with `fl-`, taking a `start/end` value pair. The pair rides Tailwind's native value/modifier channels (v4 allows exactly one `/` per candidate), so there is no custom parsing. Negatives put the dash first (`-fl-mt-3/5`), as the scanner requires.

### Value forms

| Form              | Example                          | Notes                                                                           |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| Theme keys        | `fl-text-base/4xl`, `fl-p-4/8`   | Both ends are theme keys of that utility's scale                                |
| Negative          | `-fl-mt-3/5`                     | Dash first; only where the core utility has negatives                           |
| Arbitrary lengths | `fl-p-[1rem]/[2rem]`             | Both must be rem-resolvable (rem or px)                                         |
| Mixed px/rem      | `fl-p-[16px]/[2rem]`             | px folds to rem at 16px/rem → `1rem`→`2rem`                                     |
| Decreasing        | `fl-p-8/4`                       | Start > end is fine; the clamp bounds swap, direction is kept                   |
| Fluid token       | `fl-text-display`, `fl-p-gutter` | A `--fl-*` theme pair, no slash (see [Fluid theme tokens](#fluid-theme-tokens)) |

### Utility roots

Every length-accepting core root is covered (92 roots). Each accepts all the value forms above.

| Family                      | Roots                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Padding                     | `fl-p`, `fl-px`, `fl-py`, `fl-ps`, `fl-pe`, `fl-pt`, `fl-pr`, `fl-pb`, `fl-pl`                             |
| Margin (±)                  | `fl-m`, `fl-mx`, `fl-my`, `fl-ms`, `fl-me`, `fl-mt`, `fl-mr`, `fl-mb`, `fl-ml`                             |
| Space between (±)           | `fl-space-x`, `fl-space-y`                                                                                 |
| Scroll margin (±) / padding | `fl-scroll-m*` (9), `fl-scroll-p*` (9)                                                                     |
| Inset (±)                   | `fl-inset`, `fl-inset-x`, `fl-inset-y`, `fl-top`, `fl-right`, `fl-bottom`, `fl-left`, `fl-start`, `fl-end` |
| Gap                         | `fl-gap`, `fl-gap-x`, `fl-gap-y`                                                                           |
| Translate (±)               | `fl-translate-x`, `fl-translate-y`                                                                         |
| Sizing                      | `fl-w`, `fl-h`, `fl-size`, `fl-min-w`, `fl-min-h`, `fl-max-w`, `fl-max-h`, `fl-basis`                      |
| Type                        | `fl-text` (size + line-height + letter-spacing), `fl-leading`, `fl-tracking`, `fl-indent` (±)              |
| Radius                      | `fl-rounded` + all corners/sides (`fl-rounded-t/r/b/l/s/e/ss/se/ee/es/tl/tr/br/bl`)                        |
| Border width                | `fl-border` + `-x/-y/-s/-e/-t/-r/-b/-l`                                                                    |
| Outline / ring / stroke     | `fl-outline`, `fl-outline-offset` (±), `fl-ring`, `fl-stroke`                                              |

`fl-text` interpolates font-size and the endpoints' `--text-*--line-height` and letter-spacing sub-values together, like v3. An explicit line-height can't ride the slash (it's taken by the end value); use `fl-leading-x/y`.

### Viewport range variants

By default a fluid utility interpolates over the theme's smallest→largest `--breakpoint-*` (stock `40rem`→`96rem`, or your `min-screen`/`max-screen`). A range variant retunes that range per element. Named breakpoints resolve at build time to the injected engine variables. Stock breakpoints: `sm 40 · md 48 · lg 64 · xl 80 · 2xl 96` (rem).

| Class form             | Meaning                               | Injected range vars                |
| ---------------------- | ------------------------------------- | ---------------------------------- |
| `fl-md/lg:`            | named start / named end               | `--fl-bp-min: 48; --fl-bp-max: 64` |
| `fl-md:`               | start only → default max              | `--fl-bp-min: 48; --fl-bp-max: 96` |
| `fl/lg:`               | end only (v3's `~/lg:`) → default min | `--fl-bp-min: 40; --fl-bp-max: 64` |
| `fl-[24rem]:`          | arbitrary start, default max          | `--fl-bp-min: 24; --fl-bp-max: 96` |
| `fl-[24rem]/lg:`       | arbitrary start, named end            | `--fl-bp-min: 24; --fl-bp-max: 64` |
| `fl-md/[80rem]:`       | named start, arbitrary end            | `--fl-bp-min: 48; --fl-bp-max: 80` |
| `fl-[24rem]/[80rem]:`  | arbitrary start and end               | `--fl-bp-min: 24; --fl-bp-max: 80` |
| `fl-[384px]/[1280px]:` | px arbitraries (folded at 16)         | `--fl-bp-min: 24; --fl-bp-max: 80` |

### Container range variants

`@fl-…` variants interpolate on container width instead of the viewport (they additionally set `--fl-vw: 100cqw`; the element must be inside a `container-type` ancestor). Breakpoints resolve from `--container-*`, and the default range is the smallest→largest container token (stock `16rem`→`80rem`) — **not** the viewport breakpoints, and unaffected by `min-screen`/`max-screen`. Stock container tokens: `3xs 16 … md 28 · lg 32 … 7xl 80` (rem).

| Class form             | Injected range vars                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `@fl-md/lg:`           | `--fl-bp-min: 28; --fl-bp-max: 32; --fl-vw: 100cqw`                                   |
| `@fl-md:`              | `--fl-bp-min: 28; --fl-bp-max: 80; --fl-vw: 100cqw` (max = container default, not 96) |
| `@fl/lg:`              | `--fl-bp-min: 16; --fl-bp-max: 32; --fl-vw: 100cqw` (min = container default, not 40) |
| `@fl-[24rem]/[72rem]:` | `--fl-bp-min: 24; --fl-bp-max: 72; --fl-vw: 100cqw`                                   |

### `@plugin` options

| Option       | Default                             | Effect                                                |
| ------------ | ----------------------------------- | ----------------------------------------------------- |
| `min-screen` | smallest `--breakpoint-*` (`40rem`) | Start of the default **viewport** range (rem/px only) |
| `max-screen` | largest `--breakpoint-*` (`96rem`)  | End of the default **viewport** range (rem/px only)   |
| `checkSC144` | `true`                              | The WCAG 1.4.4 zoom-safety check on fluid font sizes  |

## How it works

Each utility inlines its two endpoint lengths at build time (resolved through the compat `theme()`), and emits a `clamp()` whose interpolation term is a `calc()` over **runtime** CSS variables — so a range variant can retune the range by simply reassigning those variables on the element. `fl-text-sm/xl` compiles to:

```css
.fl-text-sm\/xl {
	font-size: clamp(
		0.875rem,
		calc(
			0.875rem + (0.375) * (var(--fl-vw) - var(--fl-bp-min) * 1rem) /
				(var(--fl-bp-max) - var(--fl-bp-min))
		),
		1.25rem
	);
	/* + a matching line-height clamp from the --text-* sub-values */
}
```

The three engine variables are registered once via `@property` with `inherits: false` and theme-derived initial values:

```css
@property --fl-bp-min {
	syntax: "<number>";
	inherits: false;
	initial-value: 40;
}
@property --fl-bp-max {
	syntax: "<number>";
	inherits: false;
	initial-value: 96;
}
@property --fl-vw {
	syntax: "<length-percentage>";
	inherits: false;
	initial-value: 100vw;
}
```

`--fl-bp-min`/`--fl-bp-max` are unitless rem numbers; `--fl-vw` is the width source (`100vw`, swapped to `100cqw` by container variants). `inherits: false` is what makes the engine defaults apply everywhere and stops a variant's range from leaking into descendants.

## Important semantics

### Range variants are element-scoped

Because the range lives in element-level custom properties, a range variant retunes **every** fluid utility on that element — not just the one it prefixes. `fl-md/lg:fl-text-sm/xl fl-p-4/8` ranges both the text and the padding md→lg. This is the only mechanism Tailwind v4 permits (variants can't rewrite a specific utility's declarations). `inherits: false` keeps it contained to the element (descendants revert to the engine default). Two different range variants on one element **do not compose** — last-in-cascade wins for the whole element.

### Variant order matters

State/media variants must come **before** (outer to) the range variant for the range to be scoped to that state:

- `hover:fl-md/lg:fl-text-sm/xl` ✅ — the range vars nest inside `:hover`, so the retune only applies while hovered.
- `fl-md/lg:hover:fl-text-sm/xl` ⚠️ — the range vars land in the base rule (outside `:hover`), so the element's whole range is retuned **unconditionally**, while only the font-size is gated behind `:hover`.

### Unit policy: rem and px only

The interpolation term is rem-denominated, so endpoints (and breakpoints) must be rem-resolvable: **rem native, or px folded at 16px/rem**. A `0` is unit-free and adopts the other side. Any other unit (`em`, `ch`, `lh`, …) on a differing endpoint raises an `unsupported-unit` error. Consequences for stock Tailwind scales:

- **`fl-tracking`** — Tailwind's `--tracking-*` scale is em-based, so `fl-tracking-tight/wide` errors. Supply rem letter-spacing tokens, or use arbitrary rem values (`fl-tracking-[0.01rem]/[0.04rem]`).
- **`fl-stroke`** — the `--stroke-width-*` scale is unitless, so `fl-stroke-1/2` is dropped. Use arbitrary rem/px (`fl-stroke-[1px]/[2px]`).
- **`fl-leading`** — better than you might expect: the stock numeric line-height scale is rem-backed, so `fl-leading-4/8` interpolates. Only the ratio-named keys (`tight`, `snug`, `loose`, …) are unitless and are dropped; arbitrary rem values work.

### WCAG 1.4.4 zoom safety

Fluid font sizes are checked at build time against WCAG Success Criterion 1.4.4 (Resize Text). A fluid curve too shallow to reach 200% enlargement under 5× browser zoom is **rejected**: the utility emits no fluid `font-size` (only a `--tw-fl-error`), while its line-height/letter-spacing sub-values still generate. For example `fl-text-sm/5xl` over the default `40rem`→`96rem` range fails.

The check runs against the default range **at utility generation**, so only two things can change its outcome: widening the range with the `min-screen`/`max-screen` options, or disabling the check with `checkSC144: false`. A wider **variant** range (e.g. `fl-[0.5rem]/[120rem]:fl-text-sm/5xl`) **cannot** rescue it — variants never see the utility they wrap, so a variant range is invisible to generation-time validation and the pair still fails.

### Error surfacing

Invalid class forms don't throw — they emit a visible `--tw-fl-error` custom property carrying `code: message`, which shows in devtools and on IntelliSense hover, e.g. `--tw-fl-error: "no-change: Start and end are both \`1rem\` — a fluid range needs two different values";`.

| Code                                                 | Fires when                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `missing-start` / `missing-end`                      | Only one side of the pair is present (`fl-p-4`)                                                |
| `non-length-start` / `non-length-end`                | An endpoint isn't a length (`fl-p-4/foo`)                                                      |
| `unsupported-unit`                                   | A differing endpoint isn't rem-resolvable (`fl-tracking-tight/wide`)                           |
| `no-change`                                          | Start and end are equal (`fl-p-4/4`)                                                           |
| `bp-not-found`                                       | A named variant breakpoint doesn't exist (`fl-md/nope:`)                                       |
| `fails-sc-144`                                       | A font-size pair fails the WCAG 1.4.4 zoom check                                               |
| `token-not-pair` / `token-with-end` / `token-as-end` | Misused `--fl-*` token (see below)                                                             |
| `mismatched-font-weights`                            | A `fl-text` pair's endpoints have different font weights                                       |
| `mismatched-units`                                   | Dormant — kept for completeness; the px/rem-fold policy means `unsupported-unit` fires instead |

Some malformed forms (an unknown bareword start like `fl-p-foo/4` or `fl-nope/lg:`) are dropped by Tailwind's scanner/variant matcher before the plugin runs, so they produce no output at all rather than an error surface.

## Fluid theme tokens

Define reusable endpoint pairs in `@theme` under the `--fl-*` namespace — a space-separated pair of **literal rem/px lengths** (`calc()` and other expressions aren't supported; the engine needs numeric endpoints) — and use the token name in any fluid root's value position, with no slash:

```css
@theme {
	--fl-display: 2rem 4rem;
	--fl-gutter: 0.5rem 2rem;
}
```

| Input                               | Result                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `fl-text-display`                   | `font-size: clamp(2rem … 4rem)` — size pair only (a token has no line-height tuple) |
| `fl-p-gutter`                       | `padding: clamp(0.5rem … 2rem)`                                                     |
| `-fl-m-gutter`                      | negates both ends → `margin: clamp(-2rem … -0.5rem)`                                |
| `fl-p-gutter/8`                     | error `token-with-end` — a token already sets both ends                             |
| `fl-p-4/gutter`                     | error `token-as-end` — a token can't be a range end                                 |
| `--fl-single: 2rem` → `fl-p-single` | error `missing-end` — a single value looks like a partial utility                   |
| `--fl-em: 1em 2em` → `fl-p-em`      | error `unsupported-unit` — rem/px only                                              |

If a token name collides with a real scale key (`--fl-4` vs spacing `4`, `--fl-sm` vs `text-sm`), the two forms disambiguate by shape: a **slash pair always resolves the real scale** (`fl-p-4/8` is spacing 4→8; `fl-text-sm/xl` is the text scale), and the **no-slash form resolves the token** (`fl-p-4` and `fl-text-sm` use `--fl-4` / `--fl-sm`).

## tailwind-merge companion

The `@jalendport/tailwindcss-fluid/tailwind-merge` subpath export teaches [tailwind-merge](https://github.com/dcastil/tailwind-merge) v3 (optional peer `tailwind-merge@^3`) that fluid utilities set the same CSS property as their non-fluid counterparts, so conflicting classes resolve last-one-wins. It ships in the same package as the plugin, but the plugin never imports it — so `tailwind-merge` stays an optional peer you only need when you use `withFluid`.

```ts
import { extendTailwindMerge } from 'tailwind-merge';
import { withFluid } from '@jalendport/tailwindcss-fluid/tailwind-merge';

const twMerge = extendTailwindMerge(withFluid);
```

| Input                                           | Output          | Why                                           |
| ----------------------------------------------- | --------------- | --------------------------------------------- |
| `fl-p-4/8 fl-p-2/6`                             | `fl-p-2/6`      | Same property (`padding`), last wins          |
| `p-4 fl-p-2/6`                                  | `fl-p-2/6`      | Fluid + non-fluid merge, last wins            |
| `text-lg fl-text-sm/xl`                         | `fl-text-sm/xl` | Both set font-size → merge                    |
| `-m-4 -fl-m-1/2`                                | `-fl-m-1/2`     | Negative merge, last wins                     |
| `fl-p-4/8 fl-m-2/6`                             | (both kept)     | Different properties                          |
| `fl-md/lg:fl-text-sm/xl fl-lg/xl:fl-text-sm/xl` | (both kept)     | Distinct range variants (different modifiers) |
| `@fl-md/lg:fl-p-4/8 fl-md/lg:fl-p-2/6`          | (both kept)     | Container range ≠ viewport range              |

Mechanism: `experimentalParseClassName` rewrites a fluid base class to its core-equivalent base (`fl-p-4/8` → `p-4`) for conflict grouping only; the original fluid string is what's emitted. A fluid class is grouped **only when it provably compiles to its property** — both the start and end channel must validate against the same core class group, so an invalid pair like `fl-p-4/foo` (which emits only an error) is left ungrouped and merges with nothing rather than deleting a real fallback. Token forms (`fl-p-gutter`, no slash) are theme-defined and out of tailwind-merge's static knowledge, so they too stay ungrouped.

Range variants are **order-sensitive**: `hover:fl-md/lg:…` and `fl-md/lg:hover:…` are distinct groups (they scope the range differently — see below), so neither overwrites the other.

`fl-text` cross-merges are additionally gated by the same WCAG 1.4.4 check the plugin runs: a font-size pair the plugin would reject (emitting no `font-size`) is left ungrouped, so it can't delete a real `text-*`. Because this check depends on your theme, `withFluid` takes options mirroring the plugin — pass them to match a non-default plugin config:

```ts
const twMerge = extendTailwindMerge((config) =>
	withFluid(config, {
		checkSC144: false, // skip the SC 1.4.4 gate entirely (match `@plugin { checkSC144: false }`)
		minScreen: '20rem', // range start for the gate (default 40rem)
		maxScreen: '80rem', // range end for the gate   (default 96rem)
		textScale: { sm: '0.5rem', xl: 4 }, // custom --text-* sizes (rem string or number)
	}),
);
```

The gate evaluates named font sizes against the default `40rem`→`96rem` range and Tailwind's default `--text-*` scale. A custom `--text-*` scale or `--breakpoint-*` range shifts what the plugin actually emits; `minScreen`/`maxScreen`, `textScale` (rem lengths or unitless rem numbers, merged over the default scale), and `checkSC144: false` exist to realign the merge check with that reality.

Only a fluid class whose root the plugin actually supports is ever grouped — the companion bundles the plugin's root surface (a static allowlist kept in sync by a test), so an unknown root (`fl-opacity-50/75`, a custom class group) is never merged. A `no-change` pair (`fl-p-4/4`), a non-rem/px arbitrary endpoint (`fl-p-[1em]/[2em]`, `fl-p-[url(x)]/4`), and any arbitrary `fl-text` pair are likewise left alone, since the plugin emits no property for them.

## Migrating from fluid-tailwind (v3)

The canonical prefix is `fl-` (v3's `~`). Tailwind v4's Oxide scanner hard-rejects a leading `~`, so the tilde grammar can't return; `fl-` is scanner-legal and gets full IntelliSense.

| v3 (`~`)           | v4 (`fl-`)                                   |
| ------------------ | -------------------------------------------- |
| `~text-sm/lg`      | `fl-text-sm/lg`                              |
| `~-mt-3/5`         | `-fl-mt-3/5`                                 |
| `~md/lg:`          | `fl-md/lg:`                                  |
| `~/lg:`            | `fl/lg:`                                     |
| `~md:`             | `fl-md:`                                     |
| `~min-[24rem]/lg:` | `fl-[24rem]/lg:` (bracket-first — see below) |
| `~md/max-[80rem]:` | `fl-md/[80rem]:` (bracket-first end)         |
| `~@md/lg:`         | `@fl-md/lg:`                                 |

Grammar differences to know:

- **Arbitrary breakpoints are bracket-first.** v3's `min-[…]`/`max-[…]` prefixed arbitraries can't ride v4's variant channels (a bareword-prefixed bracket is dropped before the plugin runs). Use `fl-[24rem]:` (start), `fl-md/[80rem]:` (end), `fl-[24rem]/[80rem]:` (both) — and the same for `@fl-`.

Behavioral differences from v3:

- **Ranges are element-scoped**, not per-utility — a range variant retunes every fluid utility on the element (see [Important semantics](#range-variants-are-element-scoped)). v3 rewrote a single utility's declarations; v4 can't.
- **Unit policy is rem/px-only.** v3 allowed matching units of any kind; here em/ch/etc. raise `unsupported-unit`, and px folds to rem. This is why `fl-tracking`/`fl-stroke` need rem tokens.
- **Errors surface as `--tw-fl-error`**, not v3's comment rules (v4's compat layer drops comment rules). The message is visible in devtools and on IntelliSense hover.

## IntelliSense

With the [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) extension:

- **Utilities** — `fl-*` utilities autocomplete (`fl-text-…`, `fl-p-…`, and all the roots), and defined `--fl-*` tokens appear as values (`fl-text-display`).
- **Hover** over a fluid utility shows the compiled `clamp()` CSS, with `/* px */` annotations on rem values.
- **Variants** — the language server offers the arbitrary variant stubs `fl-[]:` and `@fl-[]:` after `fl-`, and recognizes `fl-`/`@fl-` prefixes so utilities complete under them (`@fl-md:fl-…`). It does not enumerate every named breakpoint pair (`fl-md/lg:`) as a discrete completion — type the breakpoint name against the recognized `fl-`/`@fl-` root.

## Credits

A ground-up rebuild of [barvian/fluid-tailwind](https://github.com/barvian/fluid-tailwind) (the `~text-sm/lg` plugin) as a native Tailwind CSS v4 plugin, inspired by its grammar and design. The interpolation math and WCAG 1.4.4 check are ported from that project, used under its MIT license (© Maxwell Barvian).

## License

MIT © Jalen Davenport
