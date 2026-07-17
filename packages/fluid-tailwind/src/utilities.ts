// Utility registration factory. Drives `matchUtilities` for each fluid root from
// a small config (root name, emission kind, target properties, negative support),
// so M2 can add the remaining ~30 roots by listing config, not writing handlers.
//
// M0 constraint honored throughout: every handler path returns a declaration
// object (a clamp, static values, or a `--tw-fl-error`) and NEVER null/undefined
// — v4 runs `Object.entries()` on the result, and the language server enumerates
// every root with no modifier, so a null return crashes the whole design system.

import type plugin from 'tailwindcss/plugin';
import { isNegated, Length } from './css';
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
	const values = theme.scales[scale];
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
	// tuple (size + line-height/letter-spacing/font-weight sub-values).
	const values: Record<string, string> = {};
	for (const key of Object.keys(theme.text)) values[key] = key;

	api.matchUtilities(
		{
			[root]: (value, { modifier }) => {
				try {
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
