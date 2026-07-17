// WCAG 1.4.4 zoom-safety math — copied from the plugin's `sc144.ts` (itself ported
// from barvian/fluid-tailwind, MIT © Maxwell Barvian) so this package stays
// dependency-free of the plugin. Keep the two in sync: the model here is the pure
// boolean twin of the plugin's `assertSC144`.
//
// Why it lives here: `withFluid` must NOT cross-merge a `fl-text` pair that the
// plugin would reject (a font-size that fails SC 1.4.4 emits NO `font-size`, so
// grouping it would delete the only class that renders the property — review
// finding 1). This is a static, tailwind-merge-side twin of that check, evaluated
// against the default (or configured) viewport range.

/** Clamp `n` into `[min, max]`. */
const clamp = (min: number, n: number, max: number): number => Math.min(Math.max(n, min), max);

/**
 * Whether the font-size pair `start`→`end` (rem numbers), fluid across
 * `startBP`→`endBP` (rem numbers), satisfies WCAG SC 1.4.4 under 5× zoom. This is
 * the inverse of the plugin's `assertSC144` (which throws on failure).
 *
 * The model: `zoom1(vw)` is the rendered size at 1× at viewport `vw`; `zoom5(vw)`
 * is the size at 5× zoom (intercept/endpoints scale ×5, but `slope·vw` does not,
 * because browsers don't zoom vw/cqw units). The pair fails if the 5×-zoomed size
 * is ever below 2× the 1× size at the checked breakpoints.
 */
export function passesSC144(start: number, end: number, startBP: number, endBP: number): boolean {
	const slope = (end - start) / (endBP - startBP);
	const intercept = start - startBP * slope;

	const zoom1 = (vw: number) => clamp(start, intercept + slope * vw, end);
	const zoom5 = (vw: number) => clamp(5 * start, 5 * intercept + slope * vw, 5 * end);

	if (5 * start < 2 * zoom1(5 * startBP)) return false;
	if (zoom5(endBP) < 2 * end) return false;
	return true;
}

// Tailwind v4's default `--text-*` scale (rem). A custom `--text-*` theme shifts
// reality — see `withFluid`'s options + the READMEs for how to realign.
export const DEFAULT_TEXT_SCALE: Record<string, number> = {
	xs: 0.75,
	sm: 0.875,
	base: 1,
	lg: 1.125,
	xl: 1.25,
	'2xl': 1.5,
	'3xl': 1.875,
	'4xl': 2.25,
	'5xl': 3,
	'6xl': 3.75,
	'7xl': 4.5,
	'8xl': 6,
	'9xl': 8,
};
