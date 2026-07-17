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
//     `text-lg`) that renders. So we rewrite only when BOTH the start and the end
//     channel validate against the same core class group (using tailwind-merge's
//     own static knowledge, via a probe merge), and for `fl-text` only when the
//     named default-scale pair also passes the SC 1.4.4 check for the configured
//     range. Anything unproven is left ungrouped → it merges with nothing and
//     deletes nothing.
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
}

/** Matches an optionally-negated fluid base class: `fl-…` or `-fl-…`. */
const FLUID_BASE = /^(-?)fl-(.+)$/;

/** Matches a `fl-…`/`@fl-…` range VARIANT (a modifier), incl. bare `fl`/`@fl`. */
const FLUID_MODIFIER = /^@?fl(?:[-/].*)?$/;

/** Parse a rem/px length option to a unitless rem number (16px/rem); null if unusable. */
function remOption(raw: string | undefined, fallback: number): number {
	if (!raw) return fallback;
	const m = /^\s*([+-]?[0-9]*\.?[0-9]+)(rem|px)?\s*$/i.exec(raw);
	if (!m) return fallback;
	const n = parseFloat(m[1]!);
	if (isNaN(n)) return fallback;
	return (m[2]?.toLowerCase() ?? 'rem') === 'px' ? n / 16 : n;
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

	// A core-only merge built from the SAME config, used purely as a validity/group
	// oracle: `probe('p-4 p-8') === 'p-8'` (single token) proves both are real
	// classes in one conflict group. This uses tailwind-merge's own static knowledge
	// without needing its non-exported class-group internals. The config passed here
	// predates our extension, so there's no recursion.
	const coreMerge = createTailwindMerge(() => config);
	const probeMergesToOne = (a: string, b: string): boolean => {
		const out = coreMerge(`${a} ${b}`);
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

	/** Whether this fluid pair is safe to cross-merge (compiles to its core property). */
	function canGroup(a: FluidAnalysis): boolean {
		// `fl-text`: the plugin emits NO font-size when the pair fails SC 1.4.4, so a
		// failing pair must not displace a real font-size. Only named default-scale
		// pairs can be checked statically; an unknown size can't be proven safe.
		if (checkSC144 && a.root === 'text') {
			const start = DEFAULT_TEXT_SCALE[a.startValue];
			const end = a.endValue != null ? DEFAULT_TEXT_SCALE[a.endValue] : undefined;
			if (start === undefined || end === undefined) return false;
			if (!passesSC144(start, end, minScreen, maxScreen)) return false;
		}
		// Both channels must be real classes in the same core group.
		return probeMergesToOne(a.startCore, a.endCore!);
	}
}
