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

// Token/scale name-collision handling (review finding 4). When a `--fl-*` token
// shares a name with a real scale/text key (`--fl-4` vs spacing `4`, `--fl-sm` vs
// `text-sm`), ONE map entry can't express both meanings. We encode the collision in
// the `matchUtilities` value using a private-use sentinel that never appears in a
// real CSS length or token, and decode it in the handler. Policy: a SLASH pair
// resolves the real scale; the NO-SLASH form resolves the token. This preserves what
// a name refers to through resolution (tagged values), instead of relying on
// map-spread order (which made token names win on length roots but lose on fl-text).
const COLLIDE = '\uE000'; // Unicode Private Use Area char, never present in a real value

/** Encode a name present in BOTH the scale and the token map (sentinel-delimited). */
const encodeCollision = (scaleValue: string, token: string): string =>
	COLLIDE + scaleValue + COLLIDE + token;

/**
 * Decode a collision value, unwrapping v4's `calc(… * -1)` negation first so
 * negative-capable roots (`-fl-m-4`) still resolve. Returns null for any ordinary
 * (untagged) value, so the non-collision code path below is completely unchanged.
 */
function decodeCollision(raw: string): { primary: string; token: string; negated: boolean } | null {
	const negated = isNegated(raw);
	const bare = negated ? unnegate(raw) : raw;
	if (bare[0] !== COLLIDE) return null;
	const [, primary = '', token = ''] = bare.split(COLLIDE);
	return { primary, token, negated };
}

/** Re-wrap a decoded value in v4's `calc(… * -1)` negation form when it was negated. */
const renegate = (value: string, negated: boolean): string =>
	negated ? `calc(${value} * -1)` : value;

/** Build a value map merging a scale and the token map, tagging any name in both. */
function mergeWithTokens(
	scale: Record<string, string>,
	tokens: Record<string, string>,
): Record<string, string> {
	const values: Record<string, string> = { ...scale, ...tokens };
	for (const name of Object.keys(tokens)) {
		if (name in scale) values[name] = encodeCollision(scale[name]!, tokens[name]!);
	}
	return values;
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
	// detects a token (a space-separated value) and expands it with no slash end. A
	// name shared by both the scale and a token (`--fl-4` vs spacing `4`) is tagged
	// so the handler can honor the collision policy (slash → scale, no-slash → token).
	const scaleMap = theme.scales[scale];
	const tokens = theme.fluidTokens;
	const values = mergeWithTokens(scaleMap, tokens);
	const emitter = emit ?? assignEmitter(properties);

	// Error-surface boundary (review findings 4 & 6): a candidate only reaches this
	// handler if Tailwind first accepts its *start* value. Named values come from the
	// `values` map, so an unknown bareword start (`fl-p-foo/4`) and a malformed slash
	// (`fl-p-4/`) are still dropped by Tailwind's scanner/parser and can't be surfaced
	// here. ARBITRARY starts are governed by `type` below: it includes `'any'` (not
	// just `'length'`) so a valid uppercase-unit length like `fl-p-[16PX]/[2rem]`
	// isn't rejected by Tailwind's case-sensitive length inference before we can fold
	// its unit (finding 6). The cost is that a bracketed non-length start
	// (`fl-p-[foo]/4`) now reaches the handler and surfaces a visible
	// `non-length-start` error instead of vanishing — consistent with the plugin's
	// "surface errors visibly" model. Named-value enumeration (what the language
	// server lists) is unchanged, since arbitrary values are never enumerated.
	api.matchUtilities(
		{
			[root]: (rawValue, { modifier }): Decls => {
				try {
					// Collision policy (finding 4): a slash pair resolves the real scale,
					// the no-slash form resolves the token. Rewrite the tagged value to the
					// chosen meaning, then run the ordinary path below unchanged.
					let value = rawValue;
					const collision = decodeCollision(rawValue);
					if (collision) {
						value =
							modifier == null
								? renegate(collision.token, collision.negated) // no-slash → token
								: renegate(collision.primary, collision.negated); // slash → scale
					}

					// Fluid theme token in the value channel (`fl-p-gutter`): it carries
					// both ends, so it takes NO slash modifier and expands directly.
					const token = tokenParts(value);
					if (token) {
						if (modifier != null) error('token-with-end', value);
						const [ts, te] = tokenEndpoints(value, token.parts, token.negated);
						return emitter(generate(ts, te));
					}
					// A token can't sit in the end channel (`fl-p-4/gutter`) — but a name
					// that ALSO names a real scale value resolves to that scale value there
					// (slash pairs use the scale), so only reject token-ONLY end names.
					if (modifier != null && tokens[modifier] != null && !(modifier in scaleMap))
						error('token-as-end', modifier);

					if (modifier == null) error('missing-end');
					const start = Length.parse(value);
					if (!start) error('non-length-start', value);
					// Resolve the end from the scale; a collision-tagged end uses its scale
					// half (slash pairs never resolve the token end).
					let endRaw = values[modifier] ?? modifier;
					const endCollision = decodeCollision(endRaw);
					if (endCollision) endRaw = endCollision.primary;
					let end = Length.parse(endRaw);
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
			// `'any'` alongside `'length'` so uppercase-unit arbitrary lengths (`[16PX]`)
			// survive Tailwind's case-sensitive length inference (finding 6); our own
			// `Length.parse` then validates and folds the unit.
			type: type ?? ['length', 'any'],
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
	// no tuple), so line-height/letter-spacing fall back to static (unset). A name
	// shared by a token and a text key (`--fl-sm` vs `text-sm`) is tagged so the
	// collision policy holds (slash → text scale, no-slash → token).
	const tokens = theme.fluidTokens;
	const textKeys: Record<string, string> = {};
	for (const key of Object.keys(theme.text)) textKeys[key] = key;
	const values = mergeWithTokens(textKeys, tokens);

	api.matchUtilities(
		{
			[root]: (rawValue, { modifier }) => {
				try {
					// Collision policy (finding 4): a slash pair resolves the text scale,
					// the no-slash form resolves the token.
					let value = rawValue;
					const collision = decodeCollision(rawValue);
					if (collision) value = modifier == null ? collision.token : collision.primary;

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
					// Only a token-ONLY end name is rejected; a name that also names a text
					// key resolves as that text key (slash pairs use the scale).
					if (modifier != null && tokens[modifier] != null && !(modifier in textKeys))
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
