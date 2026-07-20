// Ported from barvian/fluid-tailwind (MIT, © Maxwell Barvian)
// Error catalog + the v4 surface mechanism.
//
// v3 emitted empty rules whose selector was an explanatory comment; the M0 spike
// proved that shape is dropped by v4's `objectToAst` compat layer. Instead every
// invalid-candidate path returns a real declaration object carrying the message
// in a `--tw-fl-error` value (survives verbatim, shows on IntelliSense hover) —
// and a `matchUtilities` handler must NEVER return null/undefined in v4 (that
// crashes the design-system build via `Object.entries`).

import type { Length } from './css';

// Every message is one actionable sentence, no leading code (the surface prepends
// `code: `). Say what to do, not just what's wrong. Codes are the stable public
// contract (tests + tailwind-merge key off them); reword freely, never rename.
export const codes = {
	'missing-start': () => 'Add a start value before the `/` (e.g. `fl-p-4/8`)',
	'missing-end': () => 'A fluid range needs a `/end` value (e.g. `fl-p-4/8`)',
	'non-length-start': (start: string) =>
		`Start \`${start}\` isn't a length — use a theme key or a bracketed length like \`[1rem]\``,
	'non-length-end': (end: string) =>
		`End \`${end}\` isn't a length — use a theme key or a bracketed length like \`[2rem]\``,
	// Dormant under the rem/px-fold unit policy (px folds to rem, so two
	// rem-resolvable endpoints always reconcile). Kept for completeness;
	// `unsupported-unit` is what fires now. See PLAN's 2026-07-17 amendment.
	'mismatched-units': (start: Length, end: Length) =>
		`Start \`${start.cssText}\` and end \`${end.cssText}\` use different units`,
	// The runtime formula's interpolation term is rem-denominated (unitless slope ×
	// rem length), so only rem-resolvable endpoints can interpolate: rem native, px
	// folded at 16px/rem. Any other unit (em, ch, lh, …) on a differing endpoint is
	// dimensionally wrong — see PLAN's 2026-07-17 unit-policy amendment.
	'unsupported-unit': (val: Length) =>
		`\`${val.cssText}\` can't interpolate fluidly — use rem or px (other units aren't rem-resolvable)`,
	'no-change': (val: Length) =>
		`Start and end are both \`${val.cssText}\` — a fluid range needs two different values`,
	// Fluid theme tokens (`--fl-*`): a token carries BOTH ends, so it takes no slash
	// end and can't sit in the end channel, and it must be a two-value rem pair.
	// "Literal" is deliberate: endpoints must be plain lengths — `calc(…)` and other
	// expressions aren't supported, because the engine needs numeric rem endpoints.
	'token-not-pair': (val: string) =>
		`Fluid token \`${val}\` must be exactly two literal rem/px lengths (e.g. \`2rem 4rem\`); calc() and other expressions aren't supported`,
	'token-with-end': (val: string) =>
		`Fluid token \`${val}\` already sets both ends — drop the trailing \`/…\``,
	'token-as-end': (name: string) =>
		`Fluid token \`${name}\` can't be a range end — a token already carries both ends`,
	'bp-not-found': (key: string, name: string) =>
		`No \`${name}\` in \`theme.${key}\` — use a defined breakpoint or an arbitrary length like \`[24rem]\``,
	// NOTE: v3's `no-utility` code was intentionally dropped. In v4 a variant never
	// sees the utility it wraps, so a fluid variant on a non-fluid utility
	// (`fl-md/lg:p-2`) compiles normally — the error can't fire, so it isn't defined.
	'mismatched-font-weights': () =>
		"The two font-size endpoints have different font weights, which can't interpolate — give them matching weights",
	// WCAG 1.4.4 zoom-safety failure on a fluid font-size pair (see sc144.ts). The
	// utility emits no fluid font-size when this fires, only this error surface.
	// `failingBp` is the viewport width (rem) where the range stops enlarging enough.
	'fails-sc-144': (failingBp: Length) =>
		`Font-size range fails WCAG SC 1.4.4 (Resize Text): too shallow to reach 200% at 5× zoom near ${failingBp.cssText} — widen the range or set \`checkSC144: false\``,
	// A resolved range variant whose start ≥ end (`fl-md/md:`, `fl-lg/md:`): the
	// interpolation term divides by `(max - min)`, so an equal range is a runtime
	// divide-by-zero and a decreasing one interpolates backwards. Surfaced beside
	// `@slot` (no range vars emitted, so the utility falls back to the engine
	// defaults). Decreasing *value* endpoints (`fl-p-8/4`) are a different, supported
	// feature — this is about the breakpoint range only.
	'bp-range-invalid': (min: number, max: number) =>
		`Breakpoint range start (${min}rem) must be below the end (${max}rem) — an equal or decreasing breakpoint range can't interpolate`,
} satisfies Record<string, (...args: never[]) => string>;

export type ErrorCode = keyof typeof codes;

export class FluidError extends Error {
	override name = 'FluidError';

	constructor(
		readonly code: ErrorCode,
		message: string,
	) {
		super(message);
	}

	static fromCode<C extends ErrorCode>(code: C, ...args: Parameters<(typeof codes)[C]>) {
		const fn = codes[code] as (...a: Parameters<(typeof codes)[C]>) => string;
		return new FluidError(code, fn(...args));
	}
}

/** Throw a `FluidError` for `code`. Never returns. */
export function error<C extends ErrorCode>(code: C, ...args: Parameters<(typeof codes)[C]>): never {
	throw FluidError.fromCode(code, ...args);
}

/**
 * A `@plugin { … }` configuration error (bad `min-screen`/`max-screen`/`checkSC144`,
 * or an equal/inverted option range). Unlike a `FluidError`, this is NOT a per-class
 * error surfaced as `--tw-fl-error` — the options are intentional global config, so a
 * typo must fail the build loudly rather than silently reverting to defaults. Thrown
 * from the plugin factory, so it propagates out of plugin init. `errorDecl` re-throws
 * it (it isn't a `FluidError`), so it can never be swallowed into an output surface.
 */
export class FluidConfigError extends Error {
	override name = 'FluidConfigError';
}

/** Throw a `FluidConfigError` with a clear, actionable message. Never returns. */
export function configError(message: string): never {
	throw new FluidConfigError(message);
}

/** The CSS custom property carrying a fluid error into emitted output. */
export const ERROR_PROP = '--tw-fl-error';

/**
 * Escape a fluid error into a well-formed CSS string value for the `--tw-fl-error`
 * declaration. The message embeds raw user text (candidate values, token strings), so
 * a stray `"`, `\`, or newline would otherwise terminate the CSS string early and emit
 * malformed CSS. `JSON.stringify` double-quotes it and escapes exactly those (`"`→`\"`,
 * `\`→`\\`, newline→`\n`), so the value is always a single valid CSS string.
 */
export function errorSurface(e: FluidError): string {
	return JSON.stringify(`${e.code}: ${e.message}`);
}

/**
 * Turn a caught error into the `--tw-fl-error` declaration surfaced in output CSS.
 * Re-throws anything that isn't a `FluidError` (a real bug or a config error, not an
 * invalid class).
 */
export function errorDecl(e: unknown): Record<string, string> {
	if (e instanceof FluidError) {
		return { [ERROR_PROP]: errorSurface(e) };
	}
	throw e;
}
