import plugin from 'tailwindcss/plugin';

/**
 * M0 SPIKE — throwaway plugin.
 *
 * Prototype quality on purpose: it exists to prove or disprove the load-bearing
 * assumptions in PLAN.md's M0, and to seed M1. The permanent artifact from M0 is
 * the test harness, not this code.
 */

interface FluidOptions {
	'min-screen'?: string;
	'max-screen'?: string;
	checkSC144?: boolean;
}

const ROOT_PX = 16;

/** Parse a `rem`/`px`/unitless length (incl. v4's `calc(x * -1)` negatives) into a unitless rem number. */
function toRemNumber(value: string): number {
	let v = String(value).trim();
	let sign = 1;
	// v4 emits negatives for `-fl-*` candidates as `calc(<len> * -1)`.
	const neg = /^calc\((.+)\s*\*\s*-1\)$/.exec(v);
	if (neg) {
		sign = -1;
		v = neg[1]!.trim();
	}
	if (v.endsWith('rem')) return sign * parseFloat(v);
	if (v.endsWith('px')) return (sign * parseFloat(v)) / ROOT_PX;
	return sign * parseFloat(v);
}

/** A theme map from the compat `theme()` accessor, minus v4's internal `__CSS_VALUES` sentinel. */
function themeMap(raw: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (raw && typeof raw === 'object') {
		for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
			if (k.startsWith('__')) continue;
			if (typeof val === 'string') out[k] = val;
		}
	}
	return out;
}

/**
 * A non-null "this candidate is invalid" result.
 *
 * SPIKE FINDING: a v4 `matchUtilities` handler must NOT return `null`/`undefined`
 * — the engine unconditionally runs `Object.entries()` on the result, so `null`
 * throws "Cannot convert undefined or null to object". Crucially this fires during
 * the language server's full class-list enumeration (it compiles every root with
 * no modifier), which crashes the whole design system and kills IntelliSense. So
 * the fluid roots — which require a slash modifier — emit an error declaration
 * instead of bailing with null. (v3 relied on null-to-skip; v4 removed that.)
 */
const missingEnd = (): Record<string, string> => ({ '--tw-fl-error': '"missing-end"' });

/** Emit the runtime clamp formula for a start/end pair of rem lengths (endpoints inlined). */
function clamp(startRem: number, endRem: number): string {
	const lo = Math.min(startRem, endRem);
	const hi = Math.max(startRem, endRem);
	const slope = endRem - startRem; // inlined at build time
	const interpolation =
		`calc(${startRem}rem + (${slope}) * ` +
		`(var(--fl-vw) - var(--fl-bp-min) * 1rem) / ` +
		`(var(--fl-bp-max) - var(--fl-bp-min)))`;
	return `clamp(${lo}rem, ${interpolation}, ${hi}rem)`;
}

export default plugin.withOptions<FluidOptions | undefined>((options = {}) => {
	const opts = options ?? {};

	return (api) => {
		const { matchUtilities, matchVariant, addBase, theme } = api;

		// --- resolve theme scales ------------------------------------------
		const breakpoints = themeMap(theme('breakpoint'));
		const containers = themeMap(theme('containers'));
		const bpValues = Object.values(breakpoints).map(toRemNumber);
		const defaultMin = opts['min-screen']
			? toRemNumber(opts['min-screen'])
			: bpValues.length
				? Math.min(...bpValues)
				: 40;
		const defaultMax = opts['max-screen']
			? toRemNumber(opts['max-screen'])
			: bpValues.length
				? Math.max(...bpValues)
				: 96;

		// --- (5) @property engine variables at stylesheet root -------------
		addBase({
			'@property --fl-bp-min': {
				syntax: '"<number>"',
				inherits: 'false',
				'initial-value': String(defaultMin),
			},
			'@property --fl-bp-max': {
				syntax: '"<number>"',
				inherits: 'false',
				'initial-value': String(defaultMax),
			},
			'@property --fl-vw': {
				syntax: '"<length-percentage>"',
				inherits: 'false',
				'initial-value': '100vw',
			},
		});

		// --- (1) fl-text with slash modifier -------------------------------
		const textScale = themeMapTuples(theme('fontSize'));
		matchUtilities(
			{
				'fl-text': (value: string, extra: { modifier: string | null }) => {
					if (!extra.modifier) return missingEnd();
					const endRaw = textScale[extra.modifier] ?? extra.modifier;
					return {
						'font-size': clamp(toRemNumber(value), toRemNumber(endRaw)),
					};
				},
			},
			{
				values: textScale,
				modifiers: 'any',
				type: ['absolute-size', 'length'],
			},
		);

		// --- (2) negative fl-mt --------------------------------------------
		const spacingStep = toRemNumber((theme('spacing.1') as string) ?? '0.25rem');
		const spacingValues = Object.fromEntries(
			Array.from({ length: 13 }, (_, i) => [String(i), `${i * spacingStep}rem`]),
		);
		matchUtilities(
			{
				'fl-mt': (value: string, extra: { modifier: string | null }) => {
					if (!extra.modifier) return missingEnd();
					const start = toRemNumber(value);
					// Modifier rides the same spacing scale; sign follows the start value.
					const endMagnitude = toRemNumber(
						spacingValues[extra.modifier] ?? extra.modifier,
					);
					const end = start < 0 ? -endMagnitude : endMagnitude;
					return { 'margin-top': clamp(start, end) };
				},
			},
			{
				values: spacingValues,
				modifiers: 'any',
				supportsNegativeValues: true,
			},
		);

		// --- (3) viewport range variants: fl-md, fl-md/lg, fl/lg -----------
		matchVariant(
			'fl',
			(value: string, extra: { modifier: string | null }) => {
				const startBp = value ? toRemNumber(breakpoints[value] ?? value) : defaultMin;
				const endBp = extra.modifier
					? toRemNumber(breakpoints[extra.modifier] ?? extra.modifier)
					: defaultMax;
				return `&{--fl-bp-min:${startBp};--fl-bp-max:${endBp};@slot}`;
			},
			{ values: { ...breakpoints, DEFAULT: '' } },
		);

		// --- (4)(6) container range variants: @fl-md/lg, @fl/lg ------------
		matchVariant(
			'@fl',
			(value: string, extra: { modifier: string | null }) => {
				const startBp = value ? toRemNumber(containers[value] ?? value) : defaultMin;
				const endBp = extra.modifier
					? toRemNumber(containers[extra.modifier] ?? extra.modifier)
					: defaultMax;
				return `&{--fl-bp-min:${startBp};--fl-bp-max:${endBp};--fl-vw:100cqw;@slot}`;
			},
			{ values: { ...containers, DEFAULT: '' } },
		);

		// --- (9) comment/error rule ----------------------------------------
		matchUtilities(
			{
				'fl-err': () => ({ '--fl-error': '"/* fluid: mismatched-units */"' }),
			},
			{ values: { test: 'test' } },
		);
	};
});

/** Like themeMap but flattens `[size, …]` tuple values (fontSize) to just the size. */
function themeMapTuples(raw: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (raw && typeof raw === 'object') {
		for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
			if (k.startsWith('__')) continue;
			const size: unknown = Array.isArray(val) ? (val as unknown[])[0] : val;
			if (typeof size === 'string') out[k] = size;
		}
	}
	return out;
}
