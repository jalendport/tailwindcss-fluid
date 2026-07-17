// Utility registration factory. Drives `matchUtilities` for each fluid root from
// a small config (root name, emission kind, target properties, negative support),
// so M2 can add the remaining ~30 roots by listing config, not writing handlers.
//
// M0 constraint honored throughout: every handler path returns a declaration
// object (a clamp, static values, or a `--tw-fl-error`) and NEVER null/undefined
// — v4 runs `Object.entries()` on the result, and the language server enumerates
// every root with no modifier, so a null return crashes the whole design system.

import type plugin from 'tailwindcss/plugin';
import { Length } from './css';
import { error, errorDecl, FluidError } from './errors';
import { generate } from './expr';
import type { FluidText, FluidTheme } from './theme';

// PluginAPI isn't exported by tailwindcss; recover it from the plugin handler type.
export type PluginAPI = Parameters<Parameters<typeof plugin>[0]>[0];

export type UtilityKind = 'length' | 'font-size';

export interface UtilityRoot {
	/** Canonical root, e.g. `fl-p`. Negatives register automatically as `-fl-p`. */
	root: string;
	/** How values resolve and what declarations are emitted. */
	kind: UtilityKind;
	/** CSS properties the clamp is assigned to (length kind). */
	properties?: string[];
	/** Register the `-fl-…` negative form. */
	negative?: boolean;
}

/** Register one fluid root against the plugin API. */
export function registerRoot(api: PluginAPI, theme: FluidTheme, root: UtilityRoot): void {
	if (root.kind === 'font-size') registerFontSize(api, theme, root);
	else registerLength(api, theme, root);
}

function registerLength(
	api: PluginAPI,
	theme: FluidTheme,
	{ root, properties = [], negative }: UtilityRoot,
): void {
	const values = theme.spacing;

	api.matchUtilities(
		{
			[root]: (value, { modifier }) => {
				try {
					if (modifier == null) error('missing-end');
					const start = Length.parse(value);
					if (!start) error('non-length-start', value);
					let end = Length.parse(values[modifier] ?? modifier);
					if (!end) error('non-length-end', modifier);
					// v4 negates the start value for `-fl-…` but leaves the modifier
					// positive; mirror the sign so the whole range is negative.
					if (start.number < 0) end = new Length(-Math.abs(end.number), end.unit);
					const clamp = generate(start, end);
					return Object.fromEntries(properties.map((p) => [p, clamp]));
				} catch (e) {
					return errorDecl(e);
				}
			},
		},
		{
			values,
			modifiers: 'any',
			supportsNegativeValues: negative ?? false,
			type: ['length'],
		},
	);
}

function registerFontSize(api: PluginAPI, theme: FluidTheme, { root }: UtilityRoot): void {
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
					return fluidText(from, to);
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
function fluidText(from: FluidText, to: FluidText): Record<string, string> {
	const rules: Record<string, string> = {};

	// Font size always interpolates.
	try {
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
