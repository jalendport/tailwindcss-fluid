// Range-variant grammar. `fl-…` (viewport) and `@fl-…` (container) inject the
// engine range variables beside `@slot`, retuning EVERY fluid utility on the
// element — the element-scope semantic PLAN flags (custom properties are
// element-level, so `fl-md/lg:fl-text-sm/xl fl-p-4/8` ranges the padding too;
// `inherits: false` keeps that from leaking into descendants). See m3-results.
//
// v4's matchVariant value/modifier channels drive the whole grammar (no custom
// parsing):
//   • start  → the value channel: a named breakpoint (`fl-md`), a bracket-first
//              arbitrary (`fl-[24rem]`), or bare `fl` (= default min).
//   • end    → the `/modifier` channel: a named breakpoint (`/lg`), a bracket
//              arbitrary (`/[80rem]`), or absent (= default max).
// v3's `min-[…]`/`max-[…]` *prefixed* arbitraries (`fl-min-[24rem]`,
// `fl-md/max-[80rem]`) do NOT ride v4's channels — a bareword-prefixed bracket
// isn't a valid variant value/modifier and v4 drops the candidate. The
// bracket-first form (`fl-[24rem]`, `fl-md/[80rem]`) is the supported equivalent;
// this is documented in m3-results.
//
// Error surfacing (review finding 4 remainder): a bad END name (`fl-md/nope:`) or
// an unsupported-unit endpoint (`fl-[30em]:`) that reaches the callback injects a
// visible `--tw-fl-error` beside `@slot` instead of silently defaulting — and the
// callback NEVER throws (a throw crashes v4's design-system build, killing the
// language server; the never-null discipline applies here too). An unknown START
// *bareword* (`fl-nope/lg:`) can't be surfaced: v4's variant matcher drops it
// before the callback runs (the same boundary as the utility side's unknown-start
// drop). Documented in m3-results.

import { Length } from './css';
import { ERROR_PROP, FluidError } from './errors';
import { remNumber, type FluidTheme } from './theme';
import type { PluginAPI } from './utilities';

/** A resolved range channel: viewport (`fl`) or container (`@fl`). */
interface Channel {
	/** Named breakpoint/container map (`Length` values) for resolving both ends. */
	map: Record<string, Length>;
	/** `theme.<key>.<name>` in the `bp-not-found` message. */
	kind: 'breakpoint' | 'containers';
	defaultMin: number;
	defaultMax: number;
	/** Declarations injected before `@slot` on top of the range (container `--fl-vw`). */
	extra: string;
}

/**
 * Resolve the start (value channel) to a unitless rem number. v4 hands a named
 * value in already-resolved (`48rem`) and an arbitrary one as its bracket content
 * (`24rem`); an empty string is bare `fl` → default min. A non-length arbitrary
 * (`fl-[foo]`) throws `bp-not-found`; a non-rem unit throws `unsupported-unit`.
 * Unknown *barewords* never arrive here (v4 drops them before the callback).
 */
function resolveStart(value: string, channel: Channel): number {
	if (!value) return channel.defaultMin;
	const len = Length.parse(value);
	if (!len) throw FluidError.fromCode('bp-not-found', channel.kind, value);
	return remNumber(len); // may throw unsupported-unit
}

/**
 * Resolve the end (modifier channel) to a unitless rem number. Unlike the value
 * channel, modifiers arrive raw (`lg`, `80rem`, `nope`), so a named breakpoint is
 * looked up here; a bare length is parsed; anything else throws `bp-not-found`
 * rather than silently falling back to the default max (the finding-4 fix).
 */
function resolveEnd(modifier: string | null | undefined, channel: Channel): number {
	if (modifier == null) return channel.defaultMax;
	const named = channel.map[modifier];
	if (named) return remNumber(named);
	const len = Length.parse(modifier);
	if (!len) throw FluidError.fromCode('bp-not-found', channel.kind, modifier);
	return remNumber(len); // may throw unsupported-unit
}

// ⚠ VARIANT-ORDER SEMANTIC (review finding 4) — pinned, not fixable in v4.
// The range vars are injected beside `@slot` at the nesting level this variant
// occupies, and v4's variant API gives no hook to lift them into an inner
// state/media wrapper. So order matters and is a documented grammar rule:
//   hover:fl-md/lg:…  → vars nest INSIDE the :hover rule  → range scoped to hover ✅
//   fl-md/lg:hover:…  → vars land in the BASE rule (outside :hover) → the element's
//                       range is retuned UNCONDITIONALLY (every fluid utility on it),
//                       not just while hovered ⚠️
// README rule (M5): put the range variant AFTER (inner to) the state/media variant
// when the range should be scoped to that state. Asserted both ways in
// tests/variants.test.ts › "variant order semantics".
/** Build the injected declaration string, surfacing any FluidError as `--tw-fl-error`. */
function inject(channel: Channel, value: string, modifier: string | null | undefined): string {
	try {
		const min = resolveStart(value, channel);
		const max = resolveEnd(modifier, channel);
		return `&{--fl-bp-min:${min};--fl-bp-max:${max};${channel.extra}@slot}`;
	} catch (e) {
		// Surface the error into output CSS (visible on the rule + on IntelliSense
		// hover) and keep the slot so the utility still renders at the engine
		// defaults — never crash the design-system build.
		if (e instanceof FluidError) {
			return `&{${ERROR_PROP}:"${e.code}: ${e.message}";${channel.extra}@slot}`;
		}
		throw e;
	}
}

/** Name → cssText, so the `matchVariant` `values` map stays string-typed. */
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
	// Viewport ranges: fl-md, fl-md/lg, fl/lg, fl-[24rem], fl-md/[80rem], …
	const viewport: Channel = {
		map: theme.breakpoints,
		kind: 'breakpoint',
		defaultMin: range.defaultMin,
		defaultMax: range.defaultMax,
		extra: '',
	};
	api.matchVariant('fl', (value, { modifier }) => inject(viewport, value, modifier), {
		values: { ...textMap(theme.breakpoints), DEFAULT: '' },
	});

	// Container ranges: additionally swap --fl-vw to 100cqw and resolve breakpoints
	// from --container-* (default range = smallest→largest container token).
	const container: Channel = {
		map: theme.containers,
		kind: 'containers',
		defaultMin: theme.containerMin,
		defaultMax: theme.containerMax,
		extra: '--fl-vw:100cqw;',
	};
	api.matchVariant('@fl', (value, { modifier }) => inject(container, value, modifier), {
		values: { ...textMap(theme.containers), DEFAULT: '' },
	});
}
