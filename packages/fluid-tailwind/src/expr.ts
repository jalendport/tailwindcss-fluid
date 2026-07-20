// Ported from barvian/fluid-tailwind (MIT, © Maxwell Barvian)
// Interpolation math + clamp-formula emitter.
//
// v3 knew both breakpoints at build time, so it emitted a fully-computed
// `clamp(min, intercept + slope·100vw, max)`. This v4 rebuild keeps the range in
// runtime CSS variables (so range variants can retune it), so the emitted shape
// is PLAN's "Runtime clamp formula": endpoints inlined, the range carried by the
// unitless rem-denominated `--fl-bp-min` / `--fl-bp-max` / `--fl-vw` engine vars.
// The pure numeric semantics — unit reconciliation, zero-unit adoption,
// no-change/mismatch errors, precision, decreasing-range bound swap — are ported.

import { Length, type RawValue } from './css';
import { error } from './errors';
import { precision, toPrecision } from './math';

function toLength(v: Length | RawValue, side: 'start' | 'end'): Length {
	if (v instanceof Length) return new Length(v.number, v.unit);
	const len = Length.parse(v);
	if (!len) error(side === 'start' ? 'non-length-start' : 'non-length-end', String(v ?? ''));
	return len;
}

/**
 * Normalize an endpoint to a rem number per PLAN's unit policy (amended
 * 2026-07-17): rem passes through, px folds at 16px/rem, a zero is unit-free (it
 * adopts the other side's unit later), and every other unit raises
 * `unsupported-unit` because the rem-denominated interpolation term can't
 * represent it. Applied to both endpoints before any clamp is emitted.
 */
function toRem(len: Length): Length {
	if (len.number === 0) return new Length(0); // unit-free zero
	if (!len.unit || len.unit === 'rem') return new Length(len.number, 'rem');
	if (len.unit === 'px') return new Length(len.number / 16, 'rem');
	error('unsupported-unit', len);
}

/**
 * The resolved default engine range (option-resolved `min-screen`/`max-screen`, else
 * the theme's smallest/largest breakpoint) — inlined as `var()` fallbacks so the
 * default range degrades gracefully if `@property` is ever stripped (M10 §8). The
 * numbers mirror the `@property` initial-values registered in `index.ts`.
 */
export interface DefaultRange {
	min: number;
	max: number;
}

/**
 * Emit the fluid clamp formula interpolating `rawStart` → `rawEnd` over the engine
 * variables. Throws a `FluidError` for any invalid pair (the caller surfaces it as
 * a `--tw-fl-error` declaration). The `--fl-vw` variable is `100vw` by default and
 * swapped to `100cqw` by the `@fl` container variants (M3), so no unit branch here.
 *
 * Each engine `var()` carries an inline fallback matching its `@property`
 * initial-value (`--fl-vw` → `100vw`, `--fl-bp-min`/`--fl-bp-max` → the resolved
 * default range). If `@property` is ever stripped (an over-aggressive minifier, a
 * non-supporting target), the default range still renders instead of the whole
 * `clamp()` collapsing to an invalid value. `@property` stays load-bearing for the
 * `inherits: false` containment a fallback can't replace — see the README.
 */
export function generate(
	rawStart: Length | RawValue,
	rawEnd: Length | RawValue,
	range: DefaultRange,
): string {
	if (rawStart == null || rawStart === '') error('missing-start');
	if (rawEnd == null || rawEnd === '') error('missing-end');

	// Normalize both endpoints to rem (px folded, other units rejected) before
	// anything else, so the emitted clamp is always rem-denominated — the only form
	// the runtime-variable interpolation term represents correctly.
	let start = toRem(toLength(rawStart, 'start'));
	let end = toRem(toLength(rawEnd, 'end'));

	// A zero is unit-free; it adopts the other (now-rem) side's unit. With both
	// non-zero sides already rem, no unit reconciliation remains.
	if (start.number === 0) start = new Length(0, end.unit ?? 'rem');
	else if (end.number === 0) end = new Length(0, start.unit ?? 'rem');
	const unit = 'rem';

	if (start.number === end.number) error('no-change', start);

	// Cap precision so floating-point noise (e.g. a ratio·font-size line-height
	// like 1.2500000000000002) can't blow up the emitted decimals; 6 is well past
	// any real length's needed precision.
	const p = Math.min(Math.max(precision(start.number), precision(end.number), 2), 6);
	// CSS requires min < max inside clamp(); a decreasing range (start > end) swaps
	// its clamp bounds here while the interpolation keeps the true direction.
	const lo = toPrecision(Math.min(start.number, end.number), p);
	const hi = toPrecision(Math.max(start.number, end.number), p);
	const from = toPrecision(start.number, p);
	const slope = toPrecision(end.number - start.number, p);

	// Inline fallbacks (`, <default>`) on every engine var so the default range still
	// resolves if `@property` is stripped (M10 §8). `--fl-bp-min` appears twice; both
	// carry the fallback.
	const vw = `var(--fl-vw, 100vw)`;
	const bpMin = `var(--fl-bp-min, ${range.min})`;
	const bpMax = `var(--fl-bp-max, ${range.max})`;
	const interpolation =
		`calc(${from}${unit} + (${slope}) * ` +
		`(${vw} - ${bpMin} * 1rem) / ` +
		`(${bpMax} - ${bpMin}))`;

	return `clamp(${lo}${unit}, ${interpolation}, ${hi}${unit})`;
}
