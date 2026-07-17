import plugin from 'tailwindcss/plugin';
import { Length } from './css';
import { ROOTS } from './roots';
import { remNumber, resolveTheme } from './theme';
import { registerRoot } from './utilities';
import { registerVariants } from './variants';

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
		// breakpoint (unitless rem numbers).
		const minScreen = opts['min-screen'] ? Length.parse(opts['min-screen']) : null;
		const maxScreen = opts['max-screen'] ? Length.parse(opts['max-screen']) : null;
		const defaultMin = minScreen ? remNumber(minScreen) : resolved.defaultMin;
		const defaultMax = maxScreen ? remNumber(maxScreen) : resolved.defaultMax;

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
		// Disabled by `checkSC144: false` (also tolerates the string `"false"` the
		// `@plugin { … }` block may hand through).
		const sc144Enabled =
			(opts.checkSC144 as unknown) !== false && (opts.checkSC144 as unknown) !== 'false';
		const sc144 = sc144Enabled ? { min: defaultMin, max: defaultMax } : null;

		for (const root of ROOTS) registerRoot(api, resolved, root, sc144);

		// Range-variant plumbing (minimal port; full grammar is M3).
		registerVariants(api, resolved, { defaultMin, defaultMax });
	};
});

export default fluid;
