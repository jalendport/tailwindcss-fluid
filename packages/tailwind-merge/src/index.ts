// `withFluid` — a tailwind-merge v3 config extension that teaches `twMerge` about
// this plugin's `fl-` fluid utilities and `fl-…`/`@fl-…` range variants.
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
//     `canGroup`): the root is on the plugin's static allowlist (`roots.ts`); the
//     endpoints aren't identical (`no-change`); any arbitrary endpoint folds to a
//     literal rem/px length; `fl-text` isn't an unsupported arbitrary form and a
//     named `fl-text` pair passes SC 1.4.4 for the configured range/scale; and BOTH
//     channels are real classes in one core group (a probe merge). Anything
//     unproven is left ungrouped → it merges with nothing and deletes nothing.
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
import { FLUID_ROOTS } from './roots';
import { DEFAULT_TEXT_SCALE, passesSC144 } from './sc144';

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

/** A rem/px length (or unit-free zero), case-insensitive — the plugin's foldable form. */
const REM_PX_LENGTH = /^\s*([+-]?[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)(rem|px)?\s*$/i;

/** Parse a rem/px length option to a unitless rem number (16px/rem); null if unusable. */
function remOption(raw: string | number | undefined, fallback: number): number {
	if (raw == null) return fallback;
	if (typeof raw === 'number') return isNaN(raw) ? fallback : raw;
	const m = REM_PX_LENGTH.exec(raw);
	if (!m) return fallback;
	const n = parseFloat(m[1]!);
	if (isNaN(n)) return fallback;
	return (m[2]?.toLowerCase() ?? 'rem') === 'px' ? n / 16 : n;
}

/**
 * Fold an arbitrary value (`[…]` stripped) to a unitless rem number (16px/rem); null
 * if it isn't a literal rem/px length. The plugin's `toRem` only keeps rem, px, and a
 * unit-free zero; every other unit raises `unsupported-unit` and emits no property.
 */
function foldLength(inner: string): number | null {
	const m = REM_PX_LENGTH.exec(inner);
	if (!m) return null;
	const n = parseFloat(m[1]!);
	if (isNaN(n)) return null;
	if (n === 0) return 0; // unit-free zero folds; `[0rem]` ≡ `[0px]` ≡ `[0]`
	if (m[2] == null) return null; // a non-zero literal needs a rem/px unit
	return m[2].toLowerCase() === 'px' ? n / 16 : n;
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
	const rest = m[2]!;
	const slash = rest.lastIndexOf('/');

	if (slash === -1) {
		// No end channel: a token form (`fl-p-gutter`). Left ungrouped.
		const lastDash = rest.lastIndexOf('-');
		return {
			startCore: neg + rest,
			endCore: null,
			root: lastDash === -1 ? rest : rest.slice(0, lastDash),
			startValue: lastDash === -1 ? rest : rest.slice(lastDash + 1),
			endValue: null,
		};
	}

	const startPart = rest.slice(0, slash); // `p-4`, `text-sm`, `p-[1rem]`
	const endValue = rest.slice(slash + 1); // `8`, `5xl`, `[2rem]`
	const lastDash = startPart.lastIndexOf('-');
	const root = lastDash === -1 ? startPart : startPart.slice(0, lastDash);
	const startValue = lastDash === -1 ? startPart : startPart.slice(lastDash + 1);
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
 * import { withFluid } from '@tailwindcss-fluid/tailwind-merge';
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

		// 3. `fl-text` arbitrary forms. The plugin supports no arbitrary font-size pair
		//    (`fl-text-[1rem]/[2rem]` resolves neither endpoint to a text key, so no
		//    font-size is emitted) — never group, regardless of the SC 1.4.4 gate.
		if (a.root === 'text' && (startArb || endArb)) return false;

		// 4. Arbitrary endpoints must fold to a literal rem/px length (or unit-free
		//    zero). `[1em]`, `[url(x)]`, and junk raise `unsupported-unit`/`non-length`
		//    and emit no property; mixed px/rem folds and is fine.
		if (startArb && !isFoldableLength(a.startValue.slice(1, -1))) return false;
		if (endArb && !isFoldableLength(endValue.slice(1, -1))) return false;

		// 5. `fl-text` SC 1.4.4. The plugin emits NO font-size when a named pair fails
		//    the zoom-safety check, so a failing pair must not displace a real
		//    font-size. Evaluated against the (optionally custom) text scale + range.
		if (checkSC144 && a.root === 'text') {
			const start = textScale[a.startValue];
			const end = textScale[endValue];
			if (start === undefined || end === undefined) return false;
			if (!passesSC144(start, end, minScreen, maxScreen)) return false;
		}

		// 6. Both channels must be real classes in the same core conflict group.
		return probeMergesToOne(a.startCore, a.endCore!);
	}
}
