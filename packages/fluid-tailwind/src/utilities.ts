// Utility registration factory. Drives `matchUtilities` for each fluid root from
// a small config (root name, emission kind, target properties, negative support),
// so M2 can add the remaining ~30 roots by listing config, not writing handlers.
//
// M0 constraint honored throughout: every handler path returns a declaration
// object (a clamp, static values, or a `--tw-fl-error`) and NEVER null/undefined
// — v4 runs `Object.entries()` on the result, and the language server enumerates
// every root with no modifier, so a null return crashes the whole design system.

import type plugin from 'tailwindcss/plugin';
import { isNegated, Length, unnegate } from './css';
import { error, errorDecl, FluidError } from './errors';
import { generate } from './expr';
import { checkFontSizeSC144, type SC144 } from './sc144';
import type { FluidText, FluidTheme, ScaleName } from './theme';

// PluginAPI isn't exported by tailwindcss; recover it from the plugin handler type.
export type PluginAPI = Parameters<Parameters<typeof plugin>[0]>[0];

export type UtilityKind = 'length' | 'font-size';

/** A CSS-in-JS declaration block (supports nested `&`-selectors for space/divide). */
export type Decls = Record<string, string | Record<string, string>>;

/** Turn the emitted clamp string into the utility's declaration block. */
export type Emitter = (clamp: string) => Decls;

export interface UtilityRoot {
	/** Canonical root, e.g. `fl-p`. Negatives register automatically as `-fl-p`. */
	root: string;
	/** How values resolve and what declarations are emitted. Defaults to `length`. */
	kind?: UtilityKind;
	/** Which named value scale the root draws from (length kind). Defaults to `spacing`. */
	scale?: ScaleName;
	/** CSS properties the clamp is assigned to (length kind, default emitter). */
	properties?: string[];
	/**
	 * Custom emission for roots that need more than a flat property list — a child
	 * selector (`space-x`), a transform variable (`translate-x`), the ring shadow
	 * stack (`ring`). Receives the clamp; returns the full declaration block.
	 */
	emit?: Emitter;
	/** Accepted arbitrary-value data types (length kind). Defaults to `['length']`. */
	type?: Parameters<PluginAPI['matchUtilities']>[1] extends { type?: infer T } ? T : never;
	/** Register the `-fl-…` negative form. */
	negative?: boolean;
}

/** Assign the clamp to each listed CSS property. */
const assignEmitter =
	(properties: string[]): Emitter =>
	(clamp) =>
		Object.fromEntries(properties.map((p) => [p, clamp]));

/**
 * A fluid theme token in the value channel: a space-separated pair (`2rem 4rem`).
 * Returns the raw part strings plus whether v4 wrapped it in its negation form
 * (`-fl-m-gutter` → `calc(2rem 4rem * -1)`). A single-token value (a normal scale
 * value, or a 1-value token) returns null — that's the ordinary start/end path.
 */
function tokenParts(value: string): { parts: string[]; negated: boolean } | null {
	const negated = isNegated(value);
	const parts = unnegate(value).trim().split(/\s+/);
	return parts.length >= 2 ? { parts, negated } : null;
}

/** Resolve a token's two raw parts to a rem-interpolatable start/end pair (else error). */
function tokenEndpoints(raw: string, parts: string[], negated: boolean): [Length, Length] {
	if (parts.length !== 2) error('token-not-pair', raw);
	const start = Length.parse(parts[0]);
	const end = Length.parse(parts[1]);
	if (!start || !end) error('token-not-pair', raw);
	if (!negated) return [start, end];
	return [new Length(-start.number, start.unit), new Length(-end.number, end.unit)];
}

/** Register one fluid root against the plugin API. */
export function registerRoot(
	api: PluginAPI,
	theme: FluidTheme,
	root: UtilityRoot,
	sc144: SC144 | null,
): void {
	if (root.kind === 'font-size') registerFontSize(api, theme, root, sc144);
	else registerLength(api, theme, root);
}

function registerLength(
	api: PluginAPI,
	theme: FluidTheme,
	{ root, scale = 'spacing', properties = [], emit, type, negative }: UtilityRoot,
): void {
	// Fluid theme tokens (`--fl-*`) join the scale's named values, so `fl-p-gutter`
	// registers as a candidate. They resolve to their raw pair string; the handler
	// detects a token (a space-separated value) and expands it with no slash end.
	const tokens = theme.fluidTokens;
	const values = { ...theme.scales[scale], ...tokens };
	const emitter = emit ?? assignEmitter(properties);

	// Error-surface boundary (review finding 4): a candidate only reaches this
	// handler if Tailwind first accepts its *start* value against `type`/`values`.
	// So `fl-p-4/foo` and `fl-p-[3px]/foo` (valid length start, bad end) DO surface a
	// `--tw-fl-error`, but three shapes are dropped by the scanner/parser before we
	// ever run and can't be surfaced from here:
	//   • an unknown, non-length start (`fl-p-foo/4`) — filtered out by `type`;
	//   • an arbitrary non-length start (`fl-p-[foo]/4`) — same;
	//   • a malformed slash (`fl-p-4/`) — rejected by Tailwind's candidate parser.
	// The variant-side miss (`fl-nope/lg:`) is out of scope until M3. Broadening
	// `type` to `'any'` to catch the first two would make every junk class compile to
	// an error rule and flood the language server's root enumeration, so it's not
	// worth it — the boundary is intentional. Covered by the finding-4 test.
	api.matchUtilities(
		{
			[root]: (value, { modifier }): Decls => {
				try {
					// Fluid theme token in the value channel (`fl-p-gutter`): it carries
					// both ends, so it takes NO slash modifier and expands directly.
					const token = tokenParts(value);
					if (token) {
						if (modifier != null) error('token-with-end', value);
						const [ts, te] = tokenEndpoints(value, token.parts, token.negated);
						return emitter(generate(ts, te));
					}
					// A token can't sit in the end channel (`fl-p-4/gutter`).
					if (modifier != null && tokens[modifier] != null)
						error('token-as-end', modifier);

					if (modifier == null) error('missing-end');
					const start = Length.parse(value);
					if (!start) error('non-length-start', value);
					let end = Length.parse(values[modifier] ?? modifier);
					if (!end) error('non-length-end', modifier);
					// v4 hands `-fl-…` the start as `calc(<len> * -1)` but leaves the
					// modifier positive. Detect the negation structurally (not from the
					// parsed sign — a zero start parses to `-0`, and `-0 < 0` is false) and
					// mirror it onto the end so the whole range is negative.
					if (isNegated(value)) end = new Length(-Math.abs(end.number), end.unit);
					return emitter(generate(start, end));
				} catch (e) {
					return errorDecl(e);
				}
			},
		},
		{
			values,
			modifiers: 'any',
			supportsNegativeValues: negative ?? false,
			type: type ?? ['length'],
		},
	);
}

function registerFontSize(
	api: PluginAPI,
	theme: FluidTheme,
	{ root }: UtilityRoot,
	sc144: SC144 | null,
): void {
	// Identity map: the handler receives the theme key so it can pull the full
	// tuple (size + line-height/letter-spacing/font-weight sub-values). Fluid tokens
	// join in as their raw pair string; a token supplies the SIZE pair only (it has
	// no tuple), so line-height/letter-spacing fall back to static (unset).
	const tokens = theme.fluidTokens;
	const values: Record<string, string> = { ...tokens };
	for (const key of Object.keys(theme.text)) values[key] = key;

	api.matchUtilities(
		{
			[root]: (value, { modifier }) => {
				try {
					// Fluid theme token (`fl-text-display`): size pair only, no slash end.
					const token = tokenParts(value);
					if (token) {
						if (modifier != null) error('token-with-end', value);
						const [ts, te] = tokenEndpoints(value, token.parts, token.negated);
						const rules: Record<string, string> = {};
						if (sc144) checkFontSizeSC144(ts, te, sc144);
						rules['font-size'] = generate(ts, te);
						return rules;
					}
					if (modifier != null && tokens[modifier] != null)
						error('token-as-end', modifier);

					if (modifier == null) error('missing-end');
					const from = theme.text[value];
					if (!from) error('non-length-start', value);
					const to = theme.text[modifier];
					if (!to) error('non-length-end', modifier);
					return fluidText(from, to, sc144);
				} catch (e) {
					return errorDecl(e);
				}
			},
		},
		{
			values,
			modifiers: 'any',
			type: ['absolute-size', 'relative-size', 'length', 'percentage'],
		},
	);
}

/** Build the font-size rule set: interpolate the size + each differing sub-value. */
function fluidText(from: FluidText, to: FluidText, sc144: SC144 | null): Record<string, string> {
	const rules: Record<string, string> = {};

	// Font size always interpolates. When the WCAG 1.4.4 check is enabled it runs
	// FIRST (v3-faithful): a failing pair rejects the fluid font-size — no
	// `font-size` is emitted, only the `--tw-fl-error` surface — while the
	// line-height / letter-spacing sub-values below still generate independently,
	// exactly as v3 did (only the `type: true` font-size call is gated).
	try {
		if (sc144) checkFontSizeSC144(from.fontSize, to.fontSize, sc144);
		rules['font-size'] = generate(from.fontSize, to.fontSize);
	} catch (e) {
		Object.assign(rules, errorDecl(e));
	}

	interpolateSub(
		rules,
		'line-height',
		from.raw.lineHeight,
		to.raw.lineHeight,
		from.lineHeight,
		to.lineHeight,
	);
	interpolateSub(
		rules,
		'letter-spacing',
		from.raw.letterSpacing,
		to.raw.letterSpacing,
		from.letterSpacing,
		to.letterSpacing,
	);

	// Font weight is compared, not interpolated (matches v3).
	if ((from.raw.fontWeight ?? null) === (to.raw.fontWeight ?? null)) {
		if (from.fontWeight) rules['font-weight'] = from.fontWeight;
	} else {
		Object.assign(rules, errorDecl(FluidError.fromCode('mismatched-font-weights')));
	}

	return rules;
}

/**
 * Interpolate a font sub-value. Equal endpoints pass through statically; differing
 * ones interpolate as lengths (rem-converted upstream); a non-interpolatable side
 * surfaces an error.
 */
function interpolateSub(
	rules: Record<string, string>,
	prop: string,
	fromRaw: string | undefined,
	toRaw: string | undefined,
	fromLen: Length | undefined,
	toLen: Length | undefined,
): void {
	if ((fromRaw ?? null) === (toRaw ?? null)) {
		if (fromRaw != null) rules[prop] = fromRaw;
		return;
	}
	try {
		if (!fromLen && !toLen) return;
		if (!fromLen) error('missing-start');
		if (!toLen) error('missing-end');
		rules[prop] = generate(fromLen, toLen);
	} catch (e) {
		Object.assign(rules, errorDecl(e));
	}
}
