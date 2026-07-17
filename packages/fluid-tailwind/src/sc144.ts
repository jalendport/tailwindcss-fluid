// Ported from barvian/fluid-tailwind (MIT, © Maxwell Barvian)
// WCAG Success Criterion 1.4.4 (Resize Text) zoom-safety check.
//
// A fluid font-size whose slope is too shallow can defeat browser zoom: browsers
// DON'T scale `vw`/`cqw` units when zooming, so a nearly-flat fluid curve means a
// user zooming to 500% never reaches the 200% enlargement SC 1.4.4 (level AA)
// requires. v3 ran this check at build time and REJECTED the fluid font-size when
// it failed (the utility emits no fluid `font-size`, only the error surface); we
// follow that behavior — see `fluidText` in `utilities.ts`.
//
// Architectural note (per PLAN + M4 brief): our range lives in runtime CSS
// variables, so per-variant breakpoints are invisible to the utility. The check
// therefore runs against the DEFAULT range at utility-generation time (the engine
// `defaultMin`/`defaultMax`, respecting `min-screen`/`max-screen`). Per-variant
// re-checking is impossible; this is documented in PLAN and m4-results.

import { Length } from './css';
import { error } from './errors';
import { clamp } from './math';
import { remNumber } from './theme';

/** SC144 config threaded from the plugin options (null = check disabled). */
export interface SC144 {
	/** Default-range breakpoints as unitless rem numbers. */
	min: number;
	max: number;
}

/**
 * Throw `fails-sc-144` if the font-size pair `start`→`end` (fluid across
 * `startBP`→`endBP`) can't satisfy SC 1.4.4 under 5× zoom. All four arguments are
 * unitless rem numbers. Ported verbatim from v3's `expr.generate` SC144 block.
 *
 * The model: `zoom1(vw)` is the rendered size at 1× at viewport `vw`; `zoom5(vw)`
 * is the size at 5× zoom (the intercept/endpoints scale by 5, but `slope * vw`
 * does not, because vw units don't zoom). The pair fails if the 5×-zoomed size is
 * ever below 2× the 1× size at the checked breakpoints.
 */
export function assertSC144(start: number, end: number, startBP: number, endBP: number): void {
	const slope = (end - start) / (endBP - startBP);
	const intercept = start - startBP * slope;

	// 2*zoom1(vw) is the AA requirement; browsers don't scale vw when zooming, so
	// zoom5 is NOT 5*zoom1(vw).
	const zoom1 = (vw: number) => clamp(start, intercept + slope * vw, end);
	const zoom5 = (vw: number) => clamp(5 * start, 5 * intercept + slope * vw, 5 * end);

	// Check the clamped points on 2*z1(vw) and zoom5(vw); fail if zoom5 < 2*zoom1.
	if (5 * start < 2 * zoom1(5 * startBP)) {
		error('fails-sc-144', new Length(startBP * 5, 'rem')); // fails at 5*startBP
	} else if (zoom5(endBP) < 2 * end) {
		error('fails-sc-144', new Length(endBP, 'rem'));
	}
}

/**
 * Run the SC144 check on a font-size pair given as `Length`s. Folds each endpoint
 * to rem first (matching the clamp emitter's unit policy) so the comparison is
 * dimensionally sound; a non-rem-resolvable endpoint raises `unsupported-unit`,
 * exactly as the font-size clamp itself would.
 */
export function checkFontSizeSC144(from: Length, to: Length, sc144: SC144): void {
	assertSC144(remNumber(from), remNumber(to), sc144.min, sc144.max);
}
