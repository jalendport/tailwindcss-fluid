import { describe, expect, it } from 'vitest';
import { run } from './harness';

/**
 * M3 — the range-variant grammar. Assertions compile real candidates through the
 * M0 harness (Tailwind v4.3) and check the injected engine range variables, the
 * error surface, stacking with core variants, and the element-scope semantic.
 */

const nows = (s: string) => s.replace(/\s+/g, '');
/** The `@layer utilities` slice, where the generated `fl-` rules live. */
const utils = (css: string) => css.split('@layer utilities')[1] ?? '';
/** Whitespace-insensitive check that a rule injects a given `--fl-*` range pair. */
const hasRange = (css: string, min: number, max: number) =>
	nows(css).includes(`--fl-bp-min:${min};--fl-bp-max:${max}`);

// ---------------------------------------------------------------------------
// Viewport range grammar (fl-…). Stock breakpoints: sm40 md48 lg64 xl80 2xl96.
// ---------------------------------------------------------------------------
describe('viewport range variants (fl-…)', () => {
	it('fl-md/lg: named start + named end → 48 / 64', async () => {
		expect(hasRange(await run(['fl-md/lg:fl-text-sm/xl']), 48, 64)).toBe(true);
	});

	it('fl-md: start only → named start, default max (96)', async () => {
		expect(hasRange(await run(['fl-md:fl-text-sm/xl']), 48, 96)).toBe(true);
	});

	it('fl/lg: end only (v3 ~/lg) → default min (40), named end', async () => {
		expect(hasRange(await run(['fl/lg:fl-text-sm/xl']), 40, 64)).toBe(true);
	});

	it('fl-[24rem]: arbitrary start, default max', async () => {
		expect(hasRange(await run(['fl-[24rem]:fl-text-sm/xl']), 24, 96)).toBe(true);
	});

	it('fl-[24rem]/lg: arbitrary start, named end', async () => {
		expect(hasRange(await run(['fl-[24rem]/lg:fl-text-sm/xl']), 24, 64)).toBe(true);
	});

	it('fl-md/[80rem]: named start, arbitrary end', async () => {
		expect(hasRange(await run(['fl-md/[80rem]:fl-text-sm/xl']), 48, 80)).toBe(true);
	});

	it('fl-[24rem]/[80rem]: arbitrary start and end', async () => {
		expect(hasRange(await run(['fl-[24rem]/[80rem]:fl-text-sm/xl']), 24, 80)).toBe(true);
	});

	it('folds a px arbitrary breakpoint to rem (fl-[384px] → 24)', async () => {
		expect(hasRange(await run(['fl-[384px]/[1280px]:fl-text-sm/xl']), 24, 80)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Container range grammar (@fl-…). Stock containers: 3xs16 … md28 lg32 … 7xl80.
// Default container range = smallest→largest token = 16 → 80.
// ---------------------------------------------------------------------------
describe('container range variants (@fl-…)', () => {
	it('@fl-md/lg: resolves from --container-* (28 / 32) and swaps --fl-vw', async () => {
		const css = await run(['@fl-md/lg:fl-text-sm/xl']);
		expect(hasRange(css, 28, 32)).toBe(true);
		expect(nows(css)).toContain('--fl-vw:100cqw');
	});

	it('@fl-md: start only → container default max (80), not the breakpoint 96', async () => {
		expect(hasRange(await run(['@fl-md:fl-text-sm/xl']), 28, 80)).toBe(true);
	});

	it('@fl/lg: end only → container default min (16), not the breakpoint 40', async () => {
		expect(hasRange(await run(['@fl/lg:fl-text-sm/xl']), 16, 32)).toBe(true);
	});

	it('@fl-[24rem]/[72rem]: arbitrary container range', async () => {
		const css = await run(['@fl-[24rem]/[72rem]:fl-text-sm/xl']);
		expect(hasRange(css, 24, 72)).toBe(true);
		expect(nows(css)).toContain('--fl-vw:100cqw');
	});
});

// ---------------------------------------------------------------------------
// Unit policy — variant breakpoints must be rem-resolvable (rem/px), else error.
// ---------------------------------------------------------------------------
describe('variant unit policy', () => {
	it('a rem breakpoint override resolves', async () => {
		expect(hasRange(await run(['fl-[20rem]/[64rem]:fl-p-4/8']), 20, 64)).toBe(true);
	});

	it('an em arbitrary start surfaces unsupported-unit (does not crash)', async () => {
		const css = await run(['fl-[30em]:fl-text-sm/xl']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('unsupported-unit');
	});

	it('an em arbitrary end surfaces unsupported-unit', async () => {
		const css = await run(['fl-md/[30em]:fl-text-sm/xl']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('unsupported-unit');
	});
});

// ---------------------------------------------------------------------------
// Variant-side error surfacing (review finding 4 remainder).
// ---------------------------------------------------------------------------
describe('variant error surfacing', () => {
	it('a bad END name surfaces bp-not-found instead of silently defaulting (fl-md/nope)', async () => {
		const css = await run(['fl-md/nope:fl-text-sm/xl']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('bp-not-found');
		// It must NOT have silently fallen back to the default max range.
		expect(hasRange(css, 48, 96)).toBe(false);
	});

	it('a bad container END name surfaces bp-not-found (@fl-md/nope) and keeps --fl-vw', async () => {
		const css = await run(['@fl-md/nope:fl-text-sm/xl']);
		expect(css).toContain('bp-not-found');
		expect(nows(css)).toContain('--fl-vw:100cqw');
	});

	it('the injected error still leaves @slot so the utility renders', async () => {
		const css = await run(['fl-md/nope:fl-text-sm/xl']);
		// The font-size clamp (the @slot content) is still emitted on the rule.
		expect(css).toContain('font-size: clamp(');
	});

	it('an unknown START bareword is dropped by v4 before the callback (documented boundary)', async () => {
		// v4's variant matcher rejects `fl-nope` (not a known name, not arbitrary)
		// before the plugin runs, so no rule and no error can be emitted — the same
		// boundary as the utility side's unknown-start drop. This asserts the
		// boundary so a future regression (e.g. an accidental catch-all) is caught.
		const css = await run(['fl-nope/lg:fl-text-sm/xl']);
		expect(utils(css)).not.toContain('fl-nope');
		expect(css).not.toContain('--tw-fl-error');
	});
});

// ---------------------------------------------------------------------------
// Stacking with core variants (order + nesting structure).
// ---------------------------------------------------------------------------
describe('stacking with core variants', () => {
	it('lg:fl-md/xl: nests the range vars inside the lg media query', async () => {
		const css = await run(['lg:fl-md/xl:fl-text-sm/2xl']);
		expect(css).toContain('@media (width >= 64rem)');
		expect(hasRange(css, 48, 80)).toBe(true);
		// Range vars sit inside the media block, on the utility rule.
		const media = css.split('@media (width >= 64rem)')[1] ?? '';
		expect(nows(media)).toContain('--fl-bp-min:48;--fl-bp-max:80');
	});

	it('hover:fl-md/lg: nests inside the hover media + :hover selector', async () => {
		const css = await run(['hover:fl-md/lg:fl-text-sm/xl']);
		expect(css).toContain('@media (hover: hover)');
		expect(css).toContain(':hover');
		expect(hasRange(css, 48, 64)).toBe(true);
	});

	it('dark:@fl-md/lg: stacks a core variant over a container range', async () => {
		const css = await run(['dark:@fl-md/lg:fl-text-sm/xl']);
		expect(css).toContain('prefers-color-scheme: dark');
		expect(hasRange(css, 28, 32)).toBe(true);
		expect(nows(css)).toContain('--fl-vw:100cqw');
	});
});

// ---------------------------------------------------------------------------
// Variant ORDER semantics (review finding 4). A range variant injects its range
// vars beside `@slot` at whatever nesting level it sits. v4's variant API offers
// no way to lift them into an inner state/media wrapper, so ORDER is significant
// and this is a PINNED GRAMMAR RULE, not a fixable bug:
//
//   ✅ hover:fl-md/lg:…  — range scoped to :hover (vars nest inside the wrapper)
//   ⚠️ fl-md/lg:hover:…  — range applies UNCONDITIONALLY (vars land in the base
//                          rule, outside :hover), retuning the whole element even
//                          when it isn't hovered.
//
// Rule for the M5 README: range variants must come AFTER (inner to) state/media
// variants when the range should be scoped to that state. Both orders are asserted
// below so the semantic is explicit, not accidental.
// ---------------------------------------------------------------------------
describe('variant order semantics (finding 4 — pinned, not fixable in v4)', () => {
	it('hover:fl-md/lg: scopes the range vars INSIDE the hover wrapper', async () => {
		const css = await run(['hover:fl-md/lg:fl-text-sm/xl']);
		expect(css).toContain('@media (hover: hover)');
		// The range vars and the font-size live together inside the :hover rule.
		const hoverBlock = nows(css.split('@media (hover: hover)')[1] ?? '');
		expect(hoverBlock).toContain(':hover{--fl-bp-min:48;--fl-bp-max:64');
		expect(hoverBlock).toContain('font-size:clamp(');
	});

	it('fl-md/lg:hover: leaks the range vars into the UNCONDITIONAL base rule', async () => {
		const css = await run(['fl-md/lg:hover:fl-text-sm/xl']);
		const u = nows(utils(css));
		// The base (non-hover) rule carries the range vars — active even un-hovered.
		expect(u).toMatch(
			/\.fl-md\\\/lg\\:hover\\:fl-text-sm\\\/xl\{--fl-bp-min:48;--fl-bp-max:64/,
		);
		// The font-size is gated behind the hover media query, but the range is not.
		expect(css).toContain('@media (hover: hover)');
		const hoverBlock = nows(css.split('@media (hover: hover)')[1] ?? '');
		expect(hoverBlock).toContain('font-size:clamp(');
		// Critically: the hover block does NOT re-declare the range (it's in the base).
		expect(hoverBlock).not.toContain('--fl-bp-min:48');
	});
});

// ---------------------------------------------------------------------------
// Element-scope semantic (compile side; the browser proof lives in the
// playground e2e — see verify-clamp.mjs containment + last-wins cases).
// ---------------------------------------------------------------------------
describe('element-scope semantic (compile evidence)', () => {
	it('a range variant injects ONLY element-level custom properties (retunes the whole element)', async () => {
		// The variant sets --fl-bp-min/max as plain declarations on `&`, not scoped
		// to the prefixed property — so every fluid utility on the element reads them.
		const css = await run(['fl-md/lg:fl-text-sm/xl']);
		expect(hasRange(css, 48, 64)).toBe(true);
		// No property-specific scoping: the range vars and the slot content are
		// siblings on the same rule.
		const rule = utils(css);
		expect(rule).toContain('--fl-bp-min: 48');
		expect(rule).toContain('font-size: clamp(');
	});

	it('the same range variant retunes a non-text utility identically (fl-md/lg:fl-p-4/8)', async () => {
		// Proves the retune is root-agnostic: padding under the same variant gets the
		// same element-level range, so on an element carrying both it applies uniformly.
		const text = await run(['fl-md/lg:fl-text-sm/xl']);
		const pad = await run(['fl-md/lg:fl-p-4/8']);
		expect(hasRange(text, 48, 64)).toBe(true);
		expect(hasRange(pad, 48, 64)).toBe(true);
	});
});
