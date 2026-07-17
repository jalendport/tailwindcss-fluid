import plugin from 'tailwindcss/plugin';
import { Length } from './css';
import { remNumber, resolveTheme } from './theme';
import { registerRoot, type UtilityRoot } from './utilities';
import { registerVariants } from './variants';

/** Flat `@plugin "…" { … }` option block (all values arrive as strings). */
export interface FluidOptions {
	'min-screen'?: string;
	'max-screen'?: string;
	/** Accepted and stored now; the WCAG 1.4.4 check it gates lands in M4. */
	checkSC144?: boolean;
}

/**
 * The M1 root set: the two hardest utilities. `fl-p` exercises the dynamic
 * spacing scale; `fl-text` exercises font-size tuple interpolation. M2 extends
 * this list to the full ~30 length-accepting roots — additive, no handler churn.
 */
const ROOTS: UtilityRoot[] = [
	{ root: 'fl-p', kind: 'length', properties: ['padding'], negative: true },
	{ root: 'fl-text', kind: 'font-size' },
];

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

		for (const root of ROOTS) registerRoot(api, resolved, root);

		// Range-variant plumbing (minimal port; full grammar is M3).
		registerVariants(api, resolved, { defaultMin, defaultMax });
	};
});

export default fluid;
