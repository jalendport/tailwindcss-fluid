// Token/breakpoint resolution over Tailwind v4's compat `theme()`.
//
// M0 findings encoded here: breakpoints come from `theme('breakpoint')`,
// container widths from `theme('containers')` (plural — `theme('container')` is
// the empty v3 legacy config), and every scale map carries an internal
// `__CSS_VALUES__` sentinel that must be filtered. Font-size tuples arrive as
// `[size, { lineHeight, letterSpacing, fontWeight }]`, with default line-heights
// expressed as unitless ratios (`calc(1.25 / 0.875)`) that we convert to rem
// lengths so they can ride the fluid interpolation.

import { Length } from './css';
import { error } from './errors';

export type ThemeFn = (path: string) => unknown;

/** A font-size token normalized for fluid interpolation. */
export interface FluidText {
	fontSize: Length;
	/** Interpolatable sub-values (rem-converted where the source was a ratio). */
	lineHeight?: Length;
	letterSpacing?: Length;
	/** Font weight is compared, never interpolated. */
	fontWeight?: string;
	/** Original sub-value strings, for equality checks + static passthrough. */
	raw: { lineHeight?: string; letterSpacing?: string; fontWeight?: string };
}

export interface FluidTheme {
	breakpoints: Record<string, Length>;
	containers: Record<string, Length>;
	spacing: Record<string, string>;
	text: Record<string, FluidText>;
	/** Smallest / largest breakpoint as unitless rem numbers (default range). */
	defaultMin: number;
	defaultMax: number;
	/** Resolve a named breakpoint to a unitless rem number (`bp-not-found` if missing). */
	resolveBreakpoint(kind: 'breakpoint' | 'containers', name: string): number;
}

/** Convert a length to a unitless rem number (px folded at 16px/rem). */
export function remNumber(len: Length): number {
	if (len.unit === 'px') return len.number / 16;
	return len.number;
}

/** Filter a compat `theme()` map to string-valued entries, dropping `__…` sentinels. */
function stringMap(raw: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (raw && typeof raw === 'object') {
		for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
			if (k.startsWith('__')) continue;
			if (typeof v === 'string') out[k] = v;
		}
	}
	return out;
}

/** Filter a compat `theme()` map to entries whose value parses as a length. */
function lengthMap(raw: unknown): Record<string, Length> {
	const out: Record<string, Length> = {};
	for (const [k, v] of Object.entries(stringMap(raw))) {
		const len = Length.parse(v);
		if (len && len.unit) out[k] = len;
	}
	return out;
}

// Unitless line-height, either a bare number or v4's `calc(a / b)` ratio.
const ratioCalc = /^\s*calc\(\s*([0-9.]+)\s*\/\s*([0-9.]+)\s*\)\s*$/;
const bareNumber = /^\s*[0-9]*\.?[0-9]+\s*$/;

/** A line-height as a rem length: a real length passes through, a ratio scales the font size. */
function lineHeightLength(raw: string, fontSize: Length): Length | undefined {
	const asLength = Length.parse(raw);
	if (asLength && asLength.unit) return asLength;
	const m = ratioCalc.exec(raw);
	if (m)
		return new Length((parseFloat(m[1]!) / parseFloat(m[2]!)) * fontSize.number, fontSize.unit);
	if (bareNumber.test(raw)) return new Length(parseFloat(raw) * fontSize.number, fontSize.unit);
	return undefined;
}

function normalizeText(raw: unknown): Record<string, FluidText> {
	const out: Record<string, FluidText> = {};
	if (!raw || typeof raw !== 'object') return out;

	for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
		if (key.startsWith('__')) continue;

		// A font-size token is `size` or `[size, subValues]`; anything whose size
		// isn't a length (e.g. the `shadow-*` entries the compat layer folds in) is
		// not a text utility.
		const sizeRaw = Array.isArray(val) ? (val as unknown[])[0] : val;
		if (typeof sizeRaw !== 'string') continue;
		const fontSize = Length.parse(sizeRaw);
		if (!fontSize || !fontSize.unit) continue;

		const sub = (Array.isArray(val) ? (val as unknown[])[1] : undefined) as
			Record<string, unknown> | undefined;
		const lhRaw = typeof sub?.lineHeight === 'string' ? sub.lineHeight : undefined;
		const lsRaw = typeof sub?.letterSpacing === 'string' ? sub.letterSpacing : undefined;
		const fw = sub?.fontWeight;
		const fwRaw = typeof fw === 'string' || typeof fw === 'number' ? String(fw) : undefined;

		out[key] = {
			fontSize,
			lineHeight: lhRaw ? lineHeightLength(lhRaw, fontSize) : undefined,
			letterSpacing: lsRaw ? (Length.parse(lsRaw) ?? undefined) : undefined,
			fontWeight: fwRaw,
			raw: { lineHeight: lhRaw, letterSpacing: lsRaw, fontWeight: fwRaw },
		};
	}
	return out;
}

export function resolveTheme(theme: ThemeFn): FluidTheme {
	const breakpoints = lengthMap(theme('breakpoint'));
	const containers = lengthMap(theme('containers'));
	const spacing = stringMap(theme('spacing'));
	const text = normalizeText(theme('fontSize'));

	const bpNumbers = Object.values(breakpoints).map(remNumber);
	const defaultMin = bpNumbers.length ? Math.min(...bpNumbers) : 40;
	const defaultMax = bpNumbers.length ? Math.max(...bpNumbers) : 96;

	return {
		breakpoints,
		containers,
		spacing,
		text,
		defaultMin,
		defaultMax,
		resolveBreakpoint(kind, name) {
			const map = kind === 'containers' ? containers : breakpoints;
			const len = map[name];
			if (!len) error('bp-not-found', kind, name);
			return remNumber(len);
		},
	};
}
