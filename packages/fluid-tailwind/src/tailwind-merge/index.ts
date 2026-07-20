// `withFluid` — a tailwind-merge v3 config extension that teaches `twMerge` about
// this plugin's `fl-` fluid utilities and `fl-…`/`@fl-…` range variants.
//
// This is the `@jalendport/tailwindcss-fluid/tailwind-merge` subpath entry. It ships
// in the same package as the plugin so it can import the plugin's real length policy
// (`Length`/`remNumber`), SC 1.4.4 check (`assertSC144`), and root surface (`ROOTS`)
// directly — no copied-and-synced twins. It only pulls in pure helpers (no
// tailwindcss import), and the plugin's main entry never imports THIS file, so
// `tailwind-merge` stays an OPTIONAL peer: installing the plugin never requires it.
//
// The insight: a fluid utility sets the SAME CSS property as its core counterpart
// (`fl-p-4/8` and `p-4` both set padding; `fl-text-sm/xl` and `text-lg` both set
// font-size), so they must share a conflict group and resolve last-wins. Rather
// than clone every core class group (v3's approach, forced by the `~` prefix and
// tailwind-merge v2), we use `experimentalParseClassName` to REWRITE a fluid base
// class to its core-equivalent base for the purpose of group lookup:
//
//   fl-p-4/8        → p-4      (core group `p`)      → merges with p-*, fl-p-*
//   -fl-m-3/5       → -m-3     (core group `m`)      → merges with -m-*, m-*
//   fl-text-sm/xl   → text-sm  (core group font-size)→ merges with text-<size>
//
// tailwind-merge only uses `baseClassName` for conflict grouping; the ORIGINAL
// class string is what ends up in the output, so last-wins picks the real fluid
// class.
//
// TWO correctness rules the naive rewrite got wrong (review findings 1 & 2):
//
//  1. VALIDATE BEFORE GROUPING. A fluid class only sets its advertised property
//     when it actually compiles to one. `fl-p-4/foo` emits only a `--tw-fl-error`
//     (bad end value), and `fl-text-sm/5xl` emits no `font-size` under the default
//     SC 1.4.4 check. Grouping either would DELETE a real fallback (`p-2`,
//     `text-lg`) that renders. The gate encodes the PLUGIN's knowledge, not just
//     core's — a pair is grouped only when every check below passes (see
//     `canGroup`): the root is on the plugin's static allowlist (`FLUID_ROOTS`,
//     derived from the real `ROOTS`); the endpoints aren't identical (`no-change`);
//     any arbitrary endpoint folds to a literal rem/px length; a `fl-text` pair
//     (named, arbitrary, or mixed — arbitrary `fl-text` pairs are size-only and
//     groupable as of M10 §4) resolves both endpoints to differing rem sizes that
//     pass SC 1.4.4 for the configured range/scale; and BOTH channels are real
//     classes in one core group (a probe merge). Anything unproven is left ungrouped
//     → it merges with nothing and deletes nothing.
//
//  2. RANGE VARIANTS ARE ORDER-SENSITIVE. `hover:fl-md/lg:…` scopes the range to
//     hover; `fl-md/lg:hover:…` installs it unconditionally — they are NOT
//     equivalent (see the plugin's variants.ts + README). tailwind-merge sorts
//     non-order-sensitive modifiers, which would collapse the two. We wrap each
//     `fl-*`/`@fl-*` range modifier in a `[…]` sentinel in the parsed modifier
//     list, which tailwind-merge treats as an order-sensitive boundary (its
//     sort preserves the position of bracketed modifiers) — while the emitted
//     class text is the untouched original.

import { createTailwindMerge, mergeConfigs, type Config } from 'tailwind-merge';
import { Length } from '../css';
import { FluidError } from '../errors';
import { ROOTS } from '../roots';
import { assertSC144 } from '../sc144';
import { remNumber } from '../theme';

/**
 * Core-equivalent roots the plugin supports, derived from the real `ROOTS` at module
 * init (each plugin root with the leading `fl-` stripped — the base `analyzeFluid`
 * derives). Importing the source of truth means the allowlist can never drift from
 * the plugin, so no generated copy and no sync test are needed.
 */
const FLUID_ROOTS: ReadonlySet<string> = new Set(ROOTS.map((r) => r.root.replace(/^fl-/, '')));

/**
 * The same roots, longest-first, for prefix matching. Root extraction can't split on
 * `-` (M10 §5): a negative arbitrary start like `fl-mt-[-1rem]/[2rem]` carries a dash
 * INSIDE the bracket, so `lastIndexOf('-')` mis-slices the root. Matching the known
 * roots as prefixes (longest wins, so `scroll-m` beats a hypothetical `scroll`,
 * `inset-x` beats `inset`) extracts the root without touching the value at all.
 */
const FLUID_ROOTS_BY_LENGTH: readonly string[] = [...FLUID_ROOTS].sort(
	(a, b) => b.length - a.length,
);

/** The longest known fluid root that prefixes `rest` (`mt` in `mt-[-1rem]/[2rem]`), or null. */
function matchRoot(rest: string): string | null {
	for (const root of FLUID_ROOTS_BY_LENGTH) {
		if (rest === root || rest.startsWith(root + '-')) return root;
	}
	return null;
}

/**
 * Split a class body into its start value and (optional) `/end` at the top-level
 * slash — the one OUTSIDE any `[…]` arbitrary value. A bracket-depth scan keeps a
 * hypothetical slash inside an arbitrary length from being mistaken for the pair
 * separator. Returns `[start, null]` when there's no top-level slash (a token form).
 */
function splitPair(body: string): [string, string | null] {
	let depth = 0;
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === '[') depth++;
		else if (c === ']') depth--;
		else if (c === '/' && depth === 0) return [body.slice(0, i), body.slice(i + 1)];
	}
	return [body, null];
}

// Tailwind v4's default `--text-*` scale (rem). The plugin reads this from the live
// theme at build time, so there's no static export to import; this is a standalone
// copy the SC 1.4.4 gate evaluates against. A custom `--text-*` theme shifts reality
// — see `withFluid`'s `textScale` option + the READMEs for how to realign.
const DEFAULT_TEXT_SCALE: Record<string, number> = {
	xs: 0.75,
	sm: 0.875,
	base: 1,
	lg: 1.125,
	xl: 1.25,
	'2xl': 1.5,
	'3xl': 1.875,
	'4xl': 2.25,
	'5xl': 3,
	'6xl': 3.75,
	'7xl': 4.5,
	'8xl': 6,
	'9xl': 8,
};

/**
 * Whether the font-size pair `start`→`end` (rem numbers), fluid across
 * `startBP`→`endBP` (rem numbers), satisfies WCAG SC 1.4.4. Delegates to the plugin's
 * real `assertSC144` (which throws a `FluidError` on failure) and turns it into a
 * boolean, so the merge gate can never diverge from what the plugin actually rejects.
 */
function passesSC144(start: number, end: number, startBP: number, endBP: number): boolean {
	try {
		assertSC144(start, end, startBP, endBP);
		return true;
	} catch (e) {
		if (e instanceof FluidError) return false;
		throw e;
	}
}

/** Options mirroring the plugin's, so the merge check matches the plugin's reality. */
export interface WithFluidOptions {
	/**
	 * Run the SC 1.4.4 gate on `fl-text` cross-merges (default `true`, matching the
	 * plugin). `false` skips it entirely — set this to match a plugin configured
	 * with `checkSC144: false`, or the merge may keep a `fl-text` pair the plugin
	 * actually renders.
	 */
	checkSC144?: boolean;
	/** Range start for the SC 1.4.4 gate (default `40rem` — stock smallest breakpoint). */
	minScreen?: string;
	/** Range end for the SC 1.4.4 gate (default `96rem` — stock largest breakpoint). */
	maxScreen?: string;
	/**
	 * Custom `--text-*` scale, so the SC 1.4.4 gate reflects a non-default theme.
	 * Keys are size names (`sm`, `xl`, …); values are rem lengths (`'0.5rem'`) or
	 * unitless rem numbers (`0.5`). Merged over the bundled default scale, so only
	 * the overridden sizes change. Set this to match a plugin whose `--text-*` theme
	 * differs from Tailwind's default, or the merge may keep (or drop) a `fl-text`
	 * pair against the wrong sizes.
	 */
	textScale?: Record<string, string | number>;
}

/** Matches an optionally-negated fluid base class: `fl-…` or `-fl-…`. */
const FLUID_BASE = /^(-?)fl-(.+)$/;

/** Matches a `fl-…`/`@fl-…` range VARIANT (a modifier), incl. bare `fl`/`@fl`. */
const FLUID_MODIFIER = /^@?fl(?:[-/].*)?$/;

/**
 * Fold a length string to a unitless rem number (16px/rem); null if it isn't a
 * rem-resolvable literal. Uses the plugin's own `Length.parse` (case-insensitive,
 * unit-required for non-zero) + `remNumber` (rem native, px folded at 16, unit-free
 * zero) — the exact policy the clamp emitter enforces, so every non-rem/px unit
 * (`1em`, `url(x)`, junk) reads as unfoldable, matching what the plugin emits nothing
 * for.
 */
function foldLength(raw: string): number | null {
	const len = Length.parse(raw);
	if (!len) return null;
	try {
		return remNumber(len);
	} catch {
		return null;
	}
}

/** Parse a rem/px length option to a unitless rem number; the fallback if unusable. */
function remOption(raw: string | number | undefined, fallback: number): number {
	if (raw == null) return fallback;
	if (typeof raw === 'number') return isNaN(raw) ? fallback : raw;
	return foldLength(raw) ?? fallback;
}

/** Whether an arbitrary value (`[…]` stripped) folds to a literal rem/px length. */
const isFoldableLength = (inner: string): boolean => foldLength(inner) !== null;

/** Whether a value channel is a Tailwind arbitrary value (`[…]`). */
const isArbitrary = (value: string): boolean => value.startsWith('[') && value.endsWith(']');

/**
 * Resolve the SC 1.4.4 text scale: the bundled default overlaid with any custom
 * `textScale` option (rem strings or unitless rem numbers). A value that can't be
 * read as a rem/px length is dropped, so an unusable override falls back to the
 * default for that size rather than corrupting the gate.
 */
function resolveTextScale(custom: WithFluidOptions['textScale']): Record<string, number> {
	if (!custom) return DEFAULT_TEXT_SCALE;
	const scale: Record<string, number> = { ...DEFAULT_TEXT_SCALE };
	for (const [name, raw] of Object.entries(custom)) {
		const n = remOption(raw, NaN);
		if (!isNaN(n)) scale[name] = n;
	}
	return scale;
}

interface FluidAnalysis {
	/** The core-equivalent start class used for conflict grouping (`p-4`, `text-sm`). */
	startCore: string;
	/** The core-equivalent end class (`p-8`, `text-5xl`); null for a no-slash token form. */
	endCore: string | null;
	/** Root without value (`p`, `text`, `scroll-m`, `inset-x`). */
	root: string;
	/** The start/end value names (`4`/`8`, `sm`/`5xl`), for the SC 1.4.4 lookup. */
	startValue: string;
	endValue: string | null;
}

/**
 * Split a fluid base class into its core-equivalent start/end classes. Returns null
 * for a non-fluid class. A no-slash (token) form yields `endCore: null` — tokens are
 * theme-defined and out of tailwind-merge's static knowledge, so they stay ungrouped.
 */
function analyzeFluid(baseClassName: string): FluidAnalysis | null {
	const m = FLUID_BASE.exec(baseClassName);
	if (!m) return null;
	const neg = m[1]!;
	const rest = m[2]!; // `p-4`, `text-sm/xl`, `mt-[-1rem]/[2rem]`

	// Extract the root by longest known-prefix match, not by splitting on `-` — a
	// negative arbitrary start (`mt-[-1rem]`) has a dash inside its bracket (§5). An
	// unknown root (`widget-a/b`, `opacity-50/75`) matches nothing → left ungrouped.
	const root = matchRoot(rest);
	if (!root) return null;

	// Everything after `root-` is the value body: `value` or `value/end`.
	const body = rest === root ? '' : rest.slice(root.length + 1);
	const [startValue, endValue] = splitPair(body);

	if (endValue === null) {
		// No end channel: a token form (`fl-p-gutter`) or a bare root. Left ungrouped.
		return { startCore: neg + rest, endCore: null, root, startValue, endValue: null };
	}

	// `startCore` is the root with the start value (`p-4`, `mt-[-1rem]`); `endCore`
	// the root with the end value (`p-8`, `mt-[2rem]`) — the probe checks both are one
	// core group. The start portion is `rest` minus the trailing `/end`.
	const startPart = rest.slice(0, rest.length - endValue.length - 1);
	return {
		startCore: neg + startPart,
		endCore: neg + root + '-' + endValue,
		root,
		startValue,
		endValue,
	};
}

/**
 * Extend a tailwind-merge config so fluid (`fl-`) utilities merge correctly. Pass it
 * to `extendTailwindMerge`; supply options to mirror a non-default plugin config:
 *
 * ```ts
 * import { extendTailwindMerge } from 'tailwind-merge';
 * import { withFluid } from '@jalendport/tailwindcss-fluid/tailwind-merge';
 *
 * const twMerge = extendTailwindMerge(withFluid);
 * // or, matching a plugin configured with `checkSC144: false`:
 * const twMerge = extendTailwindMerge((config) => withFluid(config, { checkSC144: false }));
 * ```
 */
export function withFluid<
	ClassGroupIds extends string = string,
	ThemeGroupIds extends string = string,
>(
	config: Config<ClassGroupIds, ThemeGroupIds>,
	options: WithFluidOptions = {},
): Config<ClassGroupIds, ThemeGroupIds> {
	const checkSC144 = options.checkSC144 !== false;
	const minScreen = remOption(options.minScreen, 40);
	const maxScreen = remOption(options.maxScreen, 96);
	const textScale = resolveTextScale(options.textScale);

	// A core-only merge built from the SAME config, used purely as a validity/group
	// oracle: `probe('p-4 p-8') === 'p-8'` (single token) proves both are real
	// classes in one conflict group. This uses tailwind-merge's own static knowledge
	// without needing its non-exported class-group internals. The config passed here
	// predates our extension, so there's no recursion.
	//
	// Prefix regression fix: when the config carries a `prefix`, tailwind-merge strips
	// it before `experimentalParseClassName` runs, so the parsed bases we probe with
	// (`p-4`, `p-8`) are unprefixed — but this core oracle, built from the same
	// prefixed config, only recognizes PREFIXED classes. Re-apply the prefix to each
	// probe so a valid prefixed pair (`tw:fl-p-4/8`) still classifies as one group.
	const coreMerge = createTailwindMerge(() => config);
	const px = config.prefix ? config.prefix + ':' : '';
	const probeMergesToOne = (a: string, b: string): boolean => {
		const out = coreMerge(`${px}${a} ${px}${b}`);
		return out.length > 0 && !/\s/.test(out);
	};

	return mergeConfigs(config, {
		experimentalParseClassName({ className, parseClassName }) {
			const parsed = parseClassName(className);

			// Finding 2: make each fluid range modifier an order-sensitive boundary by
			// wrapping it in a `[…]` sentinel (tailwind-merge's modifier sort preserves
			// the position of bracketed modifiers). The emitted class stays the original.
			const modifiers = parsed.modifiers.some((mod) => FLUID_MODIFIER.test(mod))
				? parsed.modifiers.map((mod) => (FLUID_MODIFIER.test(mod) ? `[${mod}]` : mod))
				: parsed.modifiers;

			// Finding 1: only rewrite (group) a fluid base when it provably compiles to
			// its advertised property; otherwise leave it ungrouped so it deletes nothing.
			const analysis = analyzeFluid(parsed.baseClassName);
			let baseClassName = parsed.baseClassName;
			let maybePostfixModifierPosition = parsed.maybePostfixModifierPosition;

			if (analysis && analysis.endCore != null && analysis.endValue != null) {
				if (canGroup(analysis)) {
					baseClassName = analysis.startCore;
					maybePostfixModifierPosition = undefined;
				}
			}

			return { ...parsed, modifiers, baseClassName, maybePostfixModifierPosition };
		},
	}) as Config<ClassGroupIds, ThemeGroupIds>;

	/**
	 * Resolve a `fl-text` endpoint value to a rem font-size number for the no-change +
	 * SC 1.4.4 gates: a named size via the (optionally custom) text scale, an arbitrary
	 * `[…]` endpoint by folding its bracketed length. Undefined = unknown/non-foldable.
	 */
	function textSize(value: string): number | undefined {
		if (isArbitrary(value)) return foldLength(value.slice(1, -1)) ?? undefined;
		return textScale[value];
	}

	/**
	 * Whether this fluid pair is safe to cross-merge — i.e. the plugin PROVABLY emits
	 * its advertised core property for it. Each gate below mirrors a way the plugin
	 * emits nothing (only a `--tw-fl-error`), which grouping would silently turn into
	 * "delete the real class this displaces". Called only for slash pairs (`endCore`
	 * and `endValue` are non-null).
	 */
	function canGroup(a: FluidAnalysis): boolean {
		const endValue = a.endValue!;

		// 1. Root allowlist. The plugin's supported surface is static; a root it never
		//    registers (`fl-opacity`, a custom `fl-widget`) emits no property. Runs
		//    first, so unknown roots — including any reachable only through a custom
		//    tailwind-merge class group — are never grouped.
		if (!FLUID_ROOTS.has(a.root)) return false;

		const startArb = isArbitrary(a.startValue);
		const endArb = isArbitrary(endValue);

		// 2. No-change. The plugin folds each endpoint to a rem number (px at 16, zero
		//    unit-agnostic) and emits no property when they match. For two arbitrary
		//    literals, compare those folded numbers so `fl-p-[16px]/[1rem]` and
		//    `fl-p-[0rem]/[0px]` read as no-change (`fl-p-[1.0rem]/[1rem]` too — numeric,
		//    not string, equality). Named or mixed channels can't be folded statically,
		//    so raw-string equality (`fl-p-4/4`, `fl-p-[1rem]/[1rem]`) stays correct there.
		if (startArb && endArb) {
			const start = foldLength(a.startValue.slice(1, -1));
			const end = foldLength(endValue.slice(1, -1));
			if (start !== null && end !== null && start === end) return false;
		} else if (a.startValue === endValue) {
			return false;
		}

		// 3. Arbitrary endpoints must fold to a literal rem/px length (or unit-free
		//    zero). `[1em]`, `[url(x)]`, and junk raise `unsupported-unit`/`non-length`
		//    and emit no property; mixed px/rem folds and is fine.
		if (startArb && !isFoldableLength(a.startValue.slice(1, -1))) return false;
		if (endArb && !isFoldableLength(endValue.slice(1, -1))) return false;

		// 4. `fl-text` pairs. A pair groups only when the plugin actually emits a
		//    font-size: both endpoints resolve to a rem size, they differ, and (when
		//    enabled) the pair passes the EXACT SC 1.4.4 check. Named endpoints resolve
		//    via the (optionally custom) text scale; arbitrary/mixed endpoints fold their
		//    bracketed length — M10 §4 made arbitrary `fl-text` pairs size-only and
		//    groupable. A no-change pair (folded start == end, incl. a named/arb mix like
		//    `fl-text-sm/[0.875rem]`) or an unknown/non-foldable endpoint emits nothing,
		//    so it stays ungrouped.
		if (a.root === 'text') {
			const start = textSize(a.startValue);
			const end = textSize(endValue);
			if (start === undefined || end === undefined) return false;
			if (start === end) return false;
			if (checkSC144 && !passesSC144(start, end, minScreen, maxScreen)) return false;
		}

		// 5. Both channels must be real classes in the same core conflict group.
		return probeMergesToOne(a.startCore, a.endCore!);
	}
}
