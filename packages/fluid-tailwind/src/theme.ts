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

/**
 * The value-scale families a length root can draw its named keys from. Each maps
 * to a compat `theme()` source and is length-filtered on resolution. `spacing` is
 * the default and backs the whole spacing family plus sizing (their numeric keys
 * share `--spacing`). Font-size tuples are handled separately (see `text`).
 */
export type ScaleName =
	| 'spacing'
	| 'radius'
	| 'borderWidth'
	| 'outlineWidth'
	| 'ringWidth'
	| 'strokeWidth'
	| 'lineHeight'
	| 'letterSpacing';

/** compat `theme()` keys for each scale family. */
const SCALE_SOURCE: Record<ScaleName, string> = {
	spacing: 'spacing',
	radius: 'borderRadius',
	borderWidth: 'borderWidth',
	outlineWidth: 'outlineWidth',
	ringWidth: 'ringWidth',
	strokeWidth: 'strokeWidth',
	lineHeight: 'lineHeight',
	letterSpacing: 'letterSpacing',
};

export interface FluidTheme {
	breakpoints: Record<string, Length>;
	containers: Record<string, Length>;
	spacing: Record<string, string>;
	/** Length-filtered named value maps, one per scale family. */
	scales: Record<ScaleName, Record<string, string>>;
	text: Record<string, FluidText>;
	/**
	 * User fluid theme tokens from the `--fl-*` namespace (`@theme { --fl-display:
	 * 2rem 4rem }`). Each maps a token name to its raw value; a valid token is a
	 * space-separated rem-resolvable pair used in a fluid utility's value position
	 * with no slash end (`fl-text-display`, `fl-p-gutter`). Validation happens at
	 * emit so a malformed token surfaces a visible error. Empty for the stock theme.
	 */
	fluidTokens: Record<string, string>;
	/** Smallest / largest breakpoint as unitless rem numbers (viewport default range). */
	defaultMin: number;
	defaultMax: number;
	/** Smallest / largest container token as unitless rem numbers (container default range). */
	containerMin: number;
	containerMax: number;
	/** Resolve a named breakpoint to a unitless rem number (`bp-not-found` if missing). */
	resolveBreakpoint(kind: 'breakpoint' | 'containers', name: string): number;
}

/**
 * Convert a length to a unitless rem number: rem native, px folded at 16px/rem, a
 * zero unit-free. Any other unit raises `unsupported-unit` — the same rem-only
 * policy the clamp emitter enforces, applied here to breakpoints, containers, and
 * the `min-screen`/`max-screen` options.
 */
export function remNumber(len: Length): number {
	if (len.number === 0) return 0;
	if (len.unit === 'rem') return len.number;
	if (len.unit === 'px') return len.number / 16;
	error('unsupported-unit', len);
}

/** Whether a length is rem-resolvable (rem, px, or zero) — safe for `remNumber`. */
const remResolvable = (len: Length): boolean =>
	len.number === 0 || len.unit === 'rem' || len.unit === 'px';

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

/**
 * A named value map for a length root: keeps only entries that parse as a length
 * with a unit. This drops the compat layer's junk (e.g. `theme('borderRadius')`
 * spreads its scalar DEFAULT into bogus numeric keys `{0:'0',1:'.',2:'2',…}`) and
 * unitless entries (`strokeWidth` `{1:'1'}`, ratio `lineHeight` `none`) that can't
 * ride the rem-denominated formula. Em `letterSpacing` values are kept so they
 * surface `unsupported-unit` at emit rather than silently vanishing.
 */
function scaleMap(raw: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(stringMap(raw))) {
		const len = Length.parse(v);
		if (len && len.unit) out[k] = v;
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
	// `--fl-*` tokens. The engine vars (`--fl-bp-min`, `--fl-vw`, …) are registered
	// via `@property`/addBase, not `@theme`, so they don't appear here — only the
	// user's fluid pairs do. Kept as raw strings; validated (2 rem-resolvable
	// values) at emit time so a bad token surfaces a `--tw-fl-error`.
	const fluidTokens = stringMap(theme('fl'));

	const scales = {} as Record<ScaleName, Record<string, string>>;
	for (const [name, source] of Object.entries(SCALE_SOURCE) as [ScaleName, string][]) {
		scales[name] = scaleMap(theme(source));
	}

	// Only rem-resolvable breakpoints seed the default range; an exotic-unit
	// breakpoint is ignored here (rather than crashing plugin init) but still errors
	// if named explicitly via `resolveBreakpoint`.
	const bpNumbers = Object.values(breakpoints).filter(remResolvable).map(remNumber);
	const defaultMin = bpNumbers.length ? Math.min(...bpNumbers) : 40;
	const defaultMax = bpNumbers.length ? Math.max(...bpNumbers) : 96;

	// Container range defaults come from the smallest→largest `--container-*` token
	// (PLAN: "container-default range = smallest→largest container token"), resolved
	// independently of the viewport `min-screen`/`max-screen` options. Falls back to
	// the viewport range only if no rem-resolvable container tokens exist.
	const cNumbers = Object.values(containers).filter(remResolvable).map(remNumber);
	const containerMin = cNumbers.length ? Math.min(...cNumbers) : defaultMin;
	const containerMax = cNumbers.length ? Math.max(...cNumbers) : defaultMax;

	return {
		breakpoints,
		containers,
		spacing,
		scales,
		text,
		fluidTokens,
		defaultMin,
		defaultMax,
		containerMin,
		containerMax,
		resolveBreakpoint(kind, name) {
			const map = kind === 'containers' ? containers : breakpoints;
			const len = map[name];
			if (!len) error('bp-not-found', kind, name);
			return remNumber(len);
		},
	};
}
