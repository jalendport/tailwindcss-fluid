import { describe, expect, it } from 'vitest';
import { run } from './harness';
import { ROOTS } from '../src/roots';
import type { ScaleName } from '../src/theme';

/**
 * M2 Phase B — full-coverage matrix. Rather than duplicate exhaustive assertions
 * per root, this file does one thorough root per scale family, a registration
 * smoke test that proves every root in the list compiles, plus the cross-cutting
 * matrices (arbitrary values / unit policy, decreasing ranges, negatives) and the
 * ported v3 scenarios adapted to the v4 grammar and the rem-only unit policy.
 */

const nows = (s: string) => s.replace(/\s+/g, '');
const clampStr = (lo: string, from: string, slope: string, hi: string, unit = 'rem') =>
	`clamp(${lo}${unit},calc(${from}${unit}+(${slope})*(var(--fl-vw)-var(--fl-bp-min)*1rem)/(var(--fl-bp-max)-var(--fl-bp-min))),${hi}${unit})`;

// ---------------------------------------------------------------------------
// One thorough root per scale family (font-size lives in engine.test.ts).
// ---------------------------------------------------------------------------
describe('scale families — one thorough root each', () => {
	it('spacing: fl-p-4/8 resolves n × --spacing', async () => {
		const css = await run(['fl-p-4/8']);
		expect(nows(css)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
	});

	it('sizing: fl-w-16/32 uses the spacing-backed width scale', async () => {
		const css = await run(['fl-w-16/32']);
		expect(nows(css)).toContain(nows(`width:${clampStr('4', '4', '4', '8')}`));
	});

	it('radius: fl-rounded-lg/2xl interpolates the radius scale', async () => {
		const css = await run(['fl-rounded-lg/2xl']);
		expect(nows(css)).toContain(nows(`border-radius:${clampStr('0.5', '0.5', '0.5', '1')}`));
	});

	it('borderWidth: fl-border-2/8 folds px endpoints to rem', async () => {
		// 2px → 0.125rem, 8px → 0.5rem, slope 0.375.
		const css = await run(['fl-border-2/8']);
		expect(nows(css)).toContain(
			nows(`border-width:${clampStr('0.125', '0.125', '0.375', '0.5')}`),
		);
	});

	it('lineHeight: numeric fl-leading-4/8 interpolates (rem-backed)', async () => {
		const css = await run(['fl-leading-4/8']);
		expect(nows(css)).toContain(nows(`line-height:${clampStr('1', '1', '1', '2')}`));
	});

	it('lineHeight: ratio-named fl-leading-tight/loose cannot (dropped, no crash)', async () => {
		const css = await run(['fl-leading-tight/loose']);
		// No fl-leading rule is generated (preflight's own line-height is unrelated).
		expect(css).not.toContain('fl-leading');
	});

	it('letterSpacing: em-named fl-tracking-tight/wide errors unsupported-unit', async () => {
		const css = await run(['fl-tracking-tight/wide']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('unsupported-unit');
	});

	it('letterSpacing: arbitrary rem fl-tracking-[0.1rem]/[0.2rem] interpolates', async () => {
		const css = await run(['fl-tracking-[0.1rem]/[0.2rem]']);
		expect(nows(css)).toContain(nows(`letter-spacing:${clampStr('0.1', '0.1', '0.1', '0.2')}`));
	});
});

// ---------------------------------------------------------------------------
// Emission hooks (roots that need more than a flat property list).
// ---------------------------------------------------------------------------
describe('emission hooks', () => {
	it('space-x emits margin on non-last children with the reverse var', async () => {
		const css = await run(['fl-space-x-2/6']);
		expect(css).toContain('.fl-space-x-2\\/6 > :not(:last-child)');
		expect(css).toContain('--tw-space-x-reverse: 0');
		expect(nows(css)).toContain('margin-inline-start:calc(');
	});

	it('translate-x sets the transform var and drives the shorthand', async () => {
		const css = await run(['fl-translate-x-2/6']);
		expect(nows(css)).toContain('--tw-translate-x:clamp(');
		expect(css).toContain('translate: var(--tw-translate-x,0) var(--tw-translate-y,0)');
	});

	it('ring emits the ring-shadow layer', async () => {
		const css = await run(['fl-ring-2/4']);
		expect(nows(css)).toContain('--tw-ring-shadow:');
		expect(css).toContain('box-shadow:');
	});
});

// ---------------------------------------------------------------------------
// Registration smoke test — every root in the list compiles to a real rule.
// This is also the never-null / full-scale enumeration guard.
// ---------------------------------------------------------------------------
describe('registration smoke — every root compiles', () => {
	// A valid candidate per scale family (named keys where the stock theme has
	// rem-resolvable ones; arbitrary rem/px where it doesn't).
	const suffix: Record<ScaleName, string> = {
		spacing: '-4/8',
		radius: '-sm/lg',
		borderWidth: '-2/4',
		outlineWidth: '-2/4',
		ringWidth: '-2/4',
		strokeWidth: '-[1px]/[2px]',
		lineHeight: '-4/8',
		letterSpacing: '-[0.1rem]/[0.2rem]',
	};
	const escape = (c: string) => c.replace(/[/[\].]/g, (ch) => '\\' + ch);

	it('emits a rule for a valid candidate of every non-font-size root', async () => {
		const roots = ROOTS.filter((r) => r.kind !== 'font-size');
		const candidates = roots.map((r) => r.root + suffix[r.scale ?? 'spacing']);
		const css = await run(candidates);
		const missing = candidates.filter((c) => !css.includes('.' + escape(c)));
		expect(missing).toEqual([]);
		// None of them should have degraded into an error declaration.
		expect(css).not.toContain('--tw-fl-error');
	});

	it('registers a healthy root count', () => {
		// Guards against an accidental truncation of the list.
		expect(ROOTS.length).toBeGreaterThanOrEqual(70);
	});
});

// ---------------------------------------------------------------------------
// Arbitrary values + unit policy.
// ---------------------------------------------------------------------------
describe('arbitrary values and unit policy', () => {
	it('interpolates a matching rem pair', async () => {
		const css = await run(['fl-p-[1rem]/[2rem]']);
		expect(nows(css)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
	});

	it('folds a px/rem mix to rem math', async () => {
		// 8px → 0.5rem, 2rem stays; slope 1.5.
		const css = await run(['fl-p-[8px]/[2rem]']);
		expect(nows(css)).toContain(nows(`padding:${clampStr('0.5', '0.5', '1.5', '2')}`));
	});

	it('lets a zero endpoint adopt the other side unit', async () => {
		const css = await run(['fl-p-0/4']);
		expect(nows(css)).toContain(nows(`padding:${clampStr('0', '0', '1', '1')}`));
	});

	it('errors unsupported-unit on a differing em endpoint', async () => {
		const css = await run(['fl-p-[1rem]/[2em]']);
		expect(css).toContain('unsupported-unit');
	});
});

// ---------------------------------------------------------------------------
// Decreasing-range matrix (start > end) across representative roots.
// ---------------------------------------------------------------------------
describe('decreasing ranges (start > end) across families', () => {
	const cases: [string, string][] = [
		['fl-p-8/4', nows(`padding:${clampStr('1', '2', '-1', '2')}`)],
		['fl-w-32/16', nows(`width:${clampStr('4', '8', '-4', '8')}`)],
		['fl-rounded-2xl/lg', nows(`border-radius:${clampStr('0.5', '1', '-0.5', '1')}`)],
		['fl-border-8/2', nows(`border-width:${clampStr('0.125', '0.5', '-0.375', '0.5')}`)],
		['fl-leading-8/4', nows(`line-height:${clampStr('1', '2', '-1', '2')}`)],
	];
	for (const [cand, expected] of cases) {
		it(`${cand} swaps clamp bounds but keeps direction`, async () => {
			expect(nows(await run([cand]))).toContain(expected);
		});
	}
});

// ---------------------------------------------------------------------------
// Negatives via the factory's negative policy.
// ---------------------------------------------------------------------------
describe('negatives', () => {
	it('-fl-m-3/5 negates both endpoints', async () => {
		const css = await run(['-fl-m-3/5']);
		expect(nows(css)).toContain(nows(`margin:${clampStr('-1.25', '-0.75', '-0.5', '-0.75')}`));
	});

	it('-fl-inset-2/4 and -fl-translate-x-2/4 negate', async () => {
		const css = await run(['-fl-inset-2/4', '-fl-translate-x-2/4']);
		expect(nows(css)).toContain(nows(`inset:${clampStr('-1', '-0.5', '-0.5', '-0.5')}`));
		expect(nows(css)).toContain('--tw-translate-x:clamp(-1rem');
	});

	it('non-negative roots refuse the -fl- form (dropped)', async () => {
		// gap has no core negative, so -fl-gap never registers.
		const css = await run(['-fl-gap-2/6']);
		expect(css).not.toContain('fl-gap');
	});
});

// ---------------------------------------------------------------------------
// Ported v3 scenarios, adapted to the v4 grammar + rem-only unit policy.
// ---------------------------------------------------------------------------
describe('ported v3 scenarios (v4-adapted)', () => {
	it('handles zeroed values (~p-0/1 → fl-p-0/1)', async () => {
		const css = await run(['fl-p-0/1']);
		expect(nows(css)).toContain(nows(`padding:${clampStr('0', '0', '0.25', '0.25')}`));
	});

	it('requires a change in values (~p-1/1 → fl-p-1/1)', async () => {
		const css = await run(['fl-p-1/1']);
		expect(css).toContain('no-change');
	});

	it('negates utilities that support negatives (~-mt-1/2 → -fl-mt-1/2)', async () => {
		const css = await run(['-fl-mt-1/2']);
		expect(nows(css)).toContain(
			nows(`margin-top:${clampStr('-0.5', '-0.25', '-0.25', '-0.25')}`),
		);
	});

	it("doesn't negate utilities that don't support negatives (~-p → -fl-p... p HAS none)", async () => {
		// Padding has no core negative; the -fl-p form must not register.
		const css = await run(['-fl-p-1/2']);
		expect(css).not.toContain('.-fl-p-1');
	});

	it('supports negative length literals (~mt-[1rem]/[-2rem] → fl-mt-[1rem]/[-2rem])', async () => {
		const css = await run(['fl-mt-[1rem]/[-2rem]']);
		expect(nows(css)).toContain(nows(`margin-top:${clampStr('-2', '1', '-3', '1')}`));
	});

	it('requires length literals (~p-[1rem]/[calc(2rem)] → non-length-end)', async () => {
		const css = await run(['fl-p-[1rem]/[calc(2rem)]']);
		expect(css).toContain('--tw-fl-error');
	});

	it('DEVIATION: px/rem literal pair now folds instead of erroring (was mismatched-units in v3)', async () => {
		// v3 rejected `~p-[1px]/[2rem]`; the v4 policy folds px → valid rem math.
		const css = await run(['fl-p-[16px]/[2rem]']);
		expect(nows(css)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
		expect(css).not.toContain('--tw-fl-error');
	});
});
