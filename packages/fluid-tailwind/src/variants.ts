// Range-variant plumbing: `fl-…` (viewport) and `@fl-…` (container) inject the
// engine range variables beside `@slot`, retuning every fluid utility on the
// element. This is the minimal port carried over from the M0 spike so the engine
// is exercisable end-to-end (and the playground e2e keeps passing). The full
// grammar — `fl-min-[…]`, stacking with core variants, arbitrary modifiers, the
// element-scope containment tests — lands in M3.

import { Length } from './css';
import { remNumber, type FluidTheme } from './theme';
import type { PluginAPI } from './utilities';

/** Resolve a variant key (named breakpoint or arbitrary length) to a rem number. */
function resolve(map: Record<string, Length>, key: string, fallback: number): number {
	if (!key) return fallback;
	const named = map[key];
	if (named) return remNumber(named);
	const len = Length.parse(key);
	return len ? remNumber(len) : fallback;
}

/** Name → cssText, so the `matchVariant` values map stays string-typed. */
function textMap(map: Record<string, Length>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(map)) out[k] = v.cssText;
	return out;
}

export function registerVariants(
	api: PluginAPI,
	theme: FluidTheme,
	range: { defaultMin: number; defaultMax: number },
): void {
	const { defaultMin, defaultMax } = range;

	// Viewport ranges: fl-md, fl-md/lg, fl/lg.
	api.matchVariant(
		'fl',
		(value, { modifier }) => {
			const min = resolve(theme.breakpoints, value, defaultMin);
			const max =
				modifier == null ? defaultMax : resolve(theme.breakpoints, modifier, defaultMax);
			return `&{--fl-bp-min:${min};--fl-bp-max:${max};@slot}`;
		},
		{ values: { ...textMap(theme.breakpoints), DEFAULT: '' } },
	);

	// Container ranges: additionally swap --fl-vw to 100cqw and resolve from --container-*.
	api.matchVariant(
		'@fl',
		(value, { modifier }) => {
			const min = resolve(theme.containers, value, defaultMin);
			const max =
				modifier == null ? defaultMax : resolve(theme.containers, modifier, defaultMax);
			return `&{--fl-bp-min:${min};--fl-bp-max:${max};--fl-vw:100cqw;@slot}`;
		},
		{ values: { ...textMap(theme.containers), DEFAULT: '' } },
	);
}
