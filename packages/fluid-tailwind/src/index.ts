import plugin from 'tailwindcss/plugin';
import { Length } from './css';
import { configError } from './errors';
import { ROOTS } from './roots';
import { remNumber, resolveTheme } from './theme';
import { registerRoot } from './utilities';
import { registerVariants } from './variants';

/** Bare unitless number (no unit) — accepted as rem for the screen options. */
const UNITLESS = /^[+-]?[0-9]*\.?[0-9]+$/;

/**
 * Resolve a `min-screen`/`max-screen` option to a unitless rem number, or null when
 * the option is absent (→ theme default). Config is intentional, so a present value
 * that isn't rem-resolvable throws a `FluidConfigError` naming the option, the value,
 * and the accepted forms — a typo must fail the build, not silently revert to the
 * default (M10 §2). Accepted: a rem/px length, or a unitless number (adopted as rem).
 */
function resolveScreen(
	option: 'min-screen' | 'max-screen',
	raw: string | undefined,
): number | null {
	if (raw == null) return null;
	const trimmed = String(raw).trim();
	if (UNITLESS.test(trimmed)) return parseFloat(trimmed);
	const len = Length.parse(trimmed);
	if (len && (len.number === 0 || len.unit === 'rem' || len.unit === 'px')) return remNumber(len);
	configError(
		`\`${option}\` must be a rem/px length or a unitless number (rem) — got \`${raw}\`.`,
	);
}

/**
 * Resolve `checkSC144` to a boolean. Absent → on (default). `true`/`false` or the
 * strings the `@plugin { … }` block hands through (`"true"`/`"false"`) are accepted;
 * any other present value throws (M10 §2 — a typo like `checkSC144: no` shouldn't
 * quietly enable the check).
 */
function resolveCheckSC144(raw: unknown): boolean {
	if (raw == null) return true;
	if (raw === true || raw === 'true') return true;
	if (raw === false || raw === 'false') return false;
	// The `@plugin { … }` block hands option values through as strings, so a present
	// invalid value is shown verbatim; fall back to its type for anything exotic.
	const shown = typeof raw === 'string' ? raw : typeof raw;
	configError(`\`checkSC144\` must be true or false — got \`${shown}\`.`);
}

/** Flat `@plugin "…" { … }` option block (all values arrive as strings). */
export interface FluidOptions {
	'min-screen'?: string;
	'max-screen'?: string;
	/** WCAG 1.4.4 zoom-safety check on fluid font-size pairs. Defaults to on. */
	checkSC144?: boolean;
}

// Explicit alias (expressed via the `plugin` import) avoids TS2742: tailwindcss
// doesn't export `PluginWithOptions`, so the inferred default-export type can't be
// named in the emitted `.d.ts` without it.
type PluginWithOptions<T> = ReturnType<typeof plugin.withOptions<T>>;

const fluid: PluginWithOptions<FluidOptions | undefined> = plugin.withOptions<
	FluidOptions | undefined
>((options = {}) => {
	const opts = options ?? {};

	return (api) => {
		const { addBase, theme } = api;
		const resolved = resolveTheme(theme);

		// Engine range: option overrides win, else the theme's smallest/largest
		// breakpoint (unitless rem numbers). A present-but-invalid option throws (§2).
		const minScreen = resolveScreen('min-screen', opts['min-screen']);
		const maxScreen = resolveScreen('max-screen', opts['max-screen']);
		const defaultMin = minScreen ?? resolved.defaultMin;
		const defaultMax = maxScreen ?? resolved.defaultMax;

		// The default range feeds the runtime interpolation directly (utilities with no
		// range variant), so it must be strictly increasing — an equal or inverted range
		// is a divide-by-zero / backwards interpolation (M10 §1). Config is intentional,
		// so this throws rather than surfacing a per-class error.
		if (!(defaultMin < defaultMax)) {
			configError(
				`The default fluid range start (${defaultMin}rem) must be below the end (${defaultMax}rem) — ` +
					`check \`min-screen\`/\`max-screen\` (or your \`--breakpoint-*\` scale).`,
			);
		}

		// Engine variables via @property: inherits:false keeps ranges from leaking
		// into descendants; theme-derived initial-values make defaults work.
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

		// WCAG 1.4.4 check runs against the default range at utility generation
		// (per-variant ranges are invisible to the utility — see sc144.ts / PLAN).
		// Disabled by `checkSC144: false`; a present-but-invalid value throws (§2).
		const sc144 = resolveCheckSC144(opts.checkSC144)
			? { min: defaultMin, max: defaultMax }
			: null;

		// The resolved default range, inlined as `var()` fallbacks in the clamp formula
		// (M10 §8) so it matches the `@property` initial-values above.
		const range = { min: defaultMin, max: defaultMax };
		for (const root of ROOTS) registerRoot(api, resolved, root, sc144, range);

		// Range-variant plumbing (minimal port; full grammar is M3).
		registerVariants(api, resolved, { defaultMin, defaultMax });
	};
});

export default fluid;
