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
// class. Range variants ride the `modifiers` channel untouched (`fl-md/lg` stays a
// distinct modifier), so `fl-md/lg:…` and `fl-lg/xl:…` form separate groups and
// never collide — exactly the semantics from PLAN's element-scoped range model.
//
// This mirrors v3's tailwind-merge semantics (a VALID fluid utility merges with its
// non-fluid counterpart, last wins — see fluid-tailwind v3's tests
// `m-[2px] ~m-[2px]/[3px]` → `~m-[2px]/[3px]`).

import { mergeConfigs, type Config } from 'tailwind-merge';

/** Matches an optionally-negated fluid base class: `fl-…` or `-fl-…`. */
const FLUID_BASE = /^(-?)fl-(.+)$/;

/**
 * Rewrite a fluid base class to the core-equivalent base used for conflict
 * grouping: drop the `fl-` prefix and the trailing `/end` of the range pair, so a
 * fluid utility lands in the same class group as its non-fluid counterpart. A
 * token form (`fl-p-gutter`, no slash) rewrites to `p-gutter`, which only groups if
 * the token name is a known value — acceptable, since tokens are theme-defined.
 */
function fluidBaseClassName(baseClassName: string): string | null {
	const m = FLUID_BASE.exec(baseClassName);
	if (!m) return null;
	let core = m[2]!;
	const slash = core.lastIndexOf('/');
	if (slash !== -1) core = core.slice(0, slash);
	return m[1]! + core;
}

/**
 * Extend a tailwind-merge config so fluid (`fl-`) utilities merge correctly. Use it
 * with `extendTailwindMerge`:
 *
 * ```ts
 * import { extendTailwindMerge } from 'tailwind-merge';
 * import { withFluid } from '@tailwindcss-fluid/tailwind-merge';
 * const twMerge = extendTailwindMerge(withFluid);
 * ```
 */
export function withFluid<
	ClassGroupIds extends string = string,
	ThemeGroupIds extends string = string,
>(config: Config<ClassGroupIds, ThemeGroupIds>): Config<ClassGroupIds, ThemeGroupIds> {
	return mergeConfigs(config, {
		experimentalParseClassName({ className, parseClassName }) {
			const parsed = parseClassName(className);
			const rewritten = fluidBaseClassName(parsed.baseClassName);
			if (rewritten == null) return parsed;
			// Group this fluid class as its core counterpart. Clear the postfix marker:
			// the `/end` is the fluid range end, not a tailwind postfix modifier, and it
			// has already been stripped from `rewritten`.
			return {
				...parsed,
				baseClassName: rewritten,
				maybePostfixModifierPosition: undefined,
			};
		},
	}) as Config<ClassGroupIds, ThemeGroupIds>;
}
