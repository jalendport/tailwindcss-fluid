import { describe, expect, it } from 'vitest';
import { extendTailwindMerge, validators } from 'tailwind-merge';
import { withFluid } from '../src/index';

const twMerge = extendTailwindMerge(withFluid);
const twMergeNoSC144 = extendTailwindMerge((config) => withFluid(config, { checkSC144: false }));
const twMergePrefixed = extendTailwindMerge({ prefix: 'tw' }, withFluid);

describe('fluid utilities merge last-wins among themselves', () => {
	it('two fluid font sizes → last wins', () => {
		expect(twMerge('fl-text-sm/xl fl-text-lg/2xl')).toBe('fl-text-lg/2xl');
	});

	it('two fluid paddings → last wins', () => {
		expect(twMerge('fl-p-4/8 fl-p-2/6')).toBe('fl-p-2/6');
	});

	it('negative fluid margins → last wins', () => {
		expect(twMerge('-fl-m-3/5 -fl-m-1/2')).toBe('-fl-m-1/2');
	});
});

describe('fluid and non-fluid merge each other (same CSS property, last wins)', () => {
	it('text-lg then fl-text-sm/xl → the fluid one wins (both set font-size)', () => {
		// Per the brief: both set font-size, so they merge — NOT keep both.
		expect(twMerge('text-lg fl-text-sm/xl')).toBe('fl-text-sm/xl');
	});

	it('fl-text-sm/xl then text-lg → the static one wins (order decides)', () => {
		expect(twMerge('fl-text-sm/xl text-lg')).toBe('text-lg');
	});

	it('p-4 then fl-p-2/6 → the fluid padding wins', () => {
		expect(twMerge('p-4 fl-p-2/6')).toBe('fl-p-2/6');
	});

	it('negative: -m-4 then -fl-m-1/2 → the fluid margin wins', () => {
		expect(twMerge('-m-4 -fl-m-1/2')).toBe('-fl-m-1/2');
	});
});

describe('unrelated fluid utilities are kept', () => {
	it('different properties do not merge', () => {
		expect(twMerge('fl-p-4/8 fl-m-2/6')).toBe('fl-p-4/8 fl-m-2/6');
	});

	it('a fluid utility and an unrelated static one are both kept', () => {
		expect(twMerge('fl-p-4/8 text-lg')).toBe('fl-p-4/8 text-lg');
	});
});

describe('range variants merge as distinct variant groups', () => {
	it('different viewport ranges on the same utility do NOT collide', () => {
		expect(twMerge('fl-md/lg:fl-text-sm/xl fl-lg/xl:fl-text-sm/xl')).toBe(
			'fl-md/lg:fl-text-sm/xl fl-lg/xl:fl-text-sm/xl',
		);
	});

	it('the SAME range variant on the same utility → last wins', () => {
		expect(twMerge('fl-md/lg:fl-text-sm/xl fl-md/lg:fl-text-lg/2xl')).toBe(
			'fl-md/lg:fl-text-lg/2xl',
		);
	});

	it('container ranges are distinct from viewport ranges', () => {
		expect(twMerge('@fl-md/lg:fl-p-4/8 fl-md/lg:fl-p-2/6')).toBe(
			'@fl-md/lg:fl-p-4/8 fl-md/lg:fl-p-2/6',
		);
	});

	it('a range variant composes with a core state variant, still distinct by range', () => {
		expect(twMerge('hover:fl-md/lg:fl-p-4/8 hover:fl-lg/xl:fl-p-2/6')).toBe(
			'hover:fl-md/lg:fl-p-4/8 hover:fl-lg/xl:fl-p-2/6',
		);
	});

	it('same range + same state → last wins', () => {
		expect(twMerge('hover:fl-md/lg:fl-p-4/8 hover:fl-md/lg:fl-p-2/6')).toBe(
			'hover:fl-md/lg:fl-p-2/6',
		);
	});
});

describe('does not disturb core merging', () => {
	it('core utilities still merge as usual', () => {
		expect(twMerge('p-4 p-8')).toBe('p-8');
		expect(twMerge('text-sm text-lg')).toBe('text-lg');
	});

	it('works alongside further config extensions', () => {
		const tw = extendTailwindMerge(
			{
				extend: {
					classGroups: { foobar: [{ 'foo-bar': [validators.isArbitraryLength] }] },
				},
			},
			withFluid,
		);
		expect(tw('fl-p-4/8 fl-p-2/6')).toBe('fl-p-2/6');
		expect(tw('foo-bar-[2px] foo-bar-[3px]')).toBe('foo-bar-[3px]');
	});
});

describe('validate before grouping — never delete a class that renders (finding 1)', () => {
	it('an invalid end value leaves the fluid class ungrouped (both kept)', () => {
		// `fl-p-4/foo` compiles to only a `--tw-fl-error`, no padding — it must not
		// displace the real `p-2`.
		expect(twMerge('p-2 fl-p-4/foo')).toBe('p-2 fl-p-4/foo');
	});

	it('a font-size pair that fails SC 1.4.4 stays ungrouped by default (both kept)', () => {
		// `fl-text-sm/5xl` (0.875→3rem over 40→96) fails SC 1.4.4, so the plugin emits
		// no font-size — it must not delete the real `text-lg`.
		expect(twMerge('text-lg fl-text-sm/5xl')).toBe('text-lg fl-text-sm/5xl');
	});

	it('the same SC-failing pair MERGES once the check is disabled', () => {
		// With `checkSC144: false` the plugin emits the font-size, so grouping is correct.
		expect(twMergeNoSC144('text-lg fl-text-sm/5xl')).toBe('fl-text-sm/5xl');
	});

	it('a valid, SC-passing font-size pair still merges by default', () => {
		expect(twMerge('text-lg fl-text-sm/xl')).toBe('fl-text-sm/xl');
	});

	it('a valid length pair still merges by default', () => {
		expect(twMerge('p-2 fl-p-4/8')).toBe('fl-p-4/8');
	});

	it('an arbitrary length pair merges when both ends validate', () => {
		expect(twMerge('p-4 fl-p-[1rem]/[2rem]')).toBe('fl-p-[1rem]/[2rem]');
	});
});

describe('the gate encodes the plugin surface, not just core (M7 fix 1)', () => {
	it('a no-change pair stays ungrouped (both kept)', () => {
		// `fl-p-4/4` folds to `no-change` — the plugin emits no padding.
		expect(twMerge('p-2 fl-p-4/4')).toBe('p-2 fl-p-4/4');
		expect(twMerge('p-2 fl-p-[1rem]/[1rem]')).toBe('p-2 fl-p-[1rem]/[1rem]');
	});

	it('non-rem/px arbitrary endpoints stay ungrouped (both kept)', () => {
		// `[1em]`/`[2em]` raise `unsupported-unit`; no padding is emitted.
		expect(twMerge('p-2 fl-p-[1em]/[2em]')).toBe('p-2 fl-p-[1em]/[2em]');
	});

	it('a non-length arbitrary endpoint stays ungrouped (both kept)', () => {
		expect(twMerge('p-2 fl-p-[url(x)]/4')).toBe('p-2 fl-p-[url(x)]/4');
		expect(twMerge('p-2 fl-p-4/[url(x)]')).toBe('p-2 fl-p-4/[url(x)]');
	});

	it('mixed px/rem arbitrary endpoints fold and DO group', () => {
		expect(twMerge('p-2 fl-p-[16px]/[2rem]')).toBe('fl-p-[16px]/[2rem]');
	});

	it('an unsupported root stays ungrouped (both kept)', () => {
		// `fl-opacity` is not a plugin root — even though core has an `opacity` group.
		expect(twMerge('opacity-25 fl-opacity-50/75')).toBe('opacity-25 fl-opacity-50/75');
	});

	it('a custom class group reachable only through the oracle stays ungrouped', () => {
		// A user-added `widget-a/widget-b` group would let the oracle merge the pair,
		// but `fl-widget` is not a plugin root, so the allowlist refuses it first.
		const tw = extendTailwindMerge(
			{ extend: { classGroups: { widget: [{ widget: ['a', 'b'] }] } } },
			withFluid,
		);
		expect(tw('widget-a fl-widget-a/b')).toBe('widget-a fl-widget-a/b');
	});

	it('an arbitrary fl-text pair never groups, even with the SC check off', () => {
		// The plugin supports no arbitrary font-size pair at all.
		expect(twMergeNoSC144('text-lg fl-text-[1rem]/[2rem]')).toBe(
			'text-lg fl-text-[1rem]/[2rem]',
		);
	});
});

describe('custom textScale realigns the SC 1.4.4 gate (M7 fix 1)', () => {
	it('a custom scale that makes a named pair fail keeps both classes', () => {
		// With `--text-sm: 0.5rem; --text-xl: 4rem`, the plugin rejects `fl-text-sm/xl`
		// (fails SC 1.4.4) and emits no font-size — so it must not delete `text-lg`.
		const tw = extendTailwindMerge((config) =>
			withFluid(config, { textScale: { sm: '0.5rem', xl: 4 } }),
		);
		expect(tw('text-lg fl-text-sm/xl')).toBe('text-lg fl-text-sm/xl');
		// The default scale still groups the same pair (it passes there).
		expect(twMerge('text-lg fl-text-sm/xl')).toBe('fl-text-sm/xl');
	});
});

describe('prefix-configured cross-merging (M7 fix 1)', () => {
	it('a valid prefixed fluid/core pair cross-merges', () => {
		expect(twMergePrefixed('tw:p-2 tw:fl-p-4/8')).toBe('tw:fl-p-4/8');
	});

	it('an invalid prefixed pair keeps both (conservative)', () => {
		expect(twMergePrefixed('tw:p-2 tw:fl-p-4/foo')).toBe('tw:p-2 tw:fl-p-4/foo');
	});

	it('prefixed fluid utilities still merge last-wins among themselves', () => {
		expect(twMergePrefixed('tw:fl-p-4/8 tw:fl-p-2/6')).toBe('tw:fl-p-2/6');
	});
});

describe('range variants are order-sensitive (finding 2)', () => {
	it('hover:fl-md/lg: and fl-md/lg:hover: are distinct groups (both kept)', () => {
		expect(twMerge('hover:fl-md/lg:fl-p-4/8 fl-md/lg:hover:fl-p-2/6')).toBe(
			'hover:fl-md/lg:fl-p-4/8 fl-md/lg:hover:fl-p-2/6',
		);
	});

	it('media order matters too: md:fl-lg/2xl: vs fl-lg/2xl:md: (both kept)', () => {
		expect(twMerge('md:fl-lg/2xl:fl-p-4/8 fl-lg/2xl:md:fl-p-2/6')).toBe(
			'md:fl-lg/2xl:fl-p-4/8 fl-lg/2xl:md:fl-p-2/6',
		);
	});

	it('identical range + state order still merges last-wins', () => {
		expect(twMerge('hover:fl-md/lg:fl-p-4/8 hover:fl-md/lg:fl-p-2/6')).toBe(
			'hover:fl-md/lg:fl-p-2/6',
		);
	});
});
