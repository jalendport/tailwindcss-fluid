import { describe, expect, it } from 'vitest';
import { extendTailwindMerge, validators } from 'tailwind-merge';
import { withFluid } from '../src/index';

const twMerge = extendTailwindMerge(withFluid);

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
