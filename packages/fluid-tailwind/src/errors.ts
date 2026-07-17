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

export const codes = {
	'missing-start': () => 'Missing start value',
	'missing-end': () => 'Missing end value',
	'non-length-start': (start: string) => `Start value \`${start}\` is not a length`,
	'non-length-end': (end: string) => `End value \`${end}\` is not a length`,
	'mismatched-units': (start: Length, end: Length) =>
		`Start \`${start.cssText}\` and end \`${end.cssText}\` units don't match`,
	// The runtime formula's interpolation term is rem-denominated (unitless slope ×
	// rem length), so only rem-resolvable endpoints can interpolate: rem native, px
	// folded at 16px/rem. Any other unit (em, ch, lh, …) on a differing endpoint is
	// dimensionally wrong — see PLAN's 2026-07-17 unit-policy amendment.
	'unsupported-unit': (val: Length) =>
		`Unit of \`${val.cssText}\` can't interpolate fluidly (only rem and px are rem-resolvable)`,
	'no-change': (val: Length) => `Start and end values are both \`${val.cssText}\``,
	'bp-not-found': (key: string, name: string) => `Could not find \`theme.${key}.${name}\``,
	'no-utility': () => 'Fluid variants can only be used with fluid utilities',
	'mismatched-font-weights': () => 'Mismatched font weights',
	// Stub until M4 wires up the WCAG 1.4.4 zoom check; the code/message exist so
	// the emitter and error surface are already shaped for it.
	'fails-sc-144': (failingBp: Length) => `Fails WCAG SC 1.4.4 at i.e. ${failingBp.cssText}`,
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

/** The CSS custom property carrying a fluid error into emitted output. */
export const ERROR_PROP = '--tw-fl-error';

/**
 * Turn a caught error into the `--tw-fl-error` declaration surfaced in output CSS.
 * Re-throws anything that isn't a `FluidError` (a real bug, not an invalid class).
 */
export function errorDecl(e: unknown): Record<string, string> {
	if (e instanceof FluidError) {
		return { [ERROR_PROP]: `"${e.code}: ${e.message}"` };
	}
	throw e;
}
