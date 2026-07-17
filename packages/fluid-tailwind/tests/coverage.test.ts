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
// Emission hooks — core PARITY / COMPOSITION (review findings 1-3, 5). These
// compile core utilities through the same harness and assert the fluid roots
// behave like core, not just that a declaration is present.
// ---------------------------------------------------------------------------

/** Grab the body of the first rule whose selector contains `needle`. */
const rule = (css: string, needle: string): string => {
	const i = css.indexOf(needle);
	if (i === -1) return '';
	const open = css.indexOf('{', i);
	const close = css.indexOf('}', open);
	return css.slice(open + 1, close);
};

describe('finding 3 — space-x/y reverse specificity parity', () => {
	it('emits the child rule at ZERO specificity (:where), like core', async () => {
		const css = await run(['fl-space-x-2/6']);
		// Core wraps the child selector in :where(...) so it adds no specificity; the
		// old plain `.fl-space-x-2\/6 > :not(:last-child)` out-specified core's reverse.
		expect(css).toContain(':where(.fl-space-x-2\\/6 > :not(:last-child))');
		expect(css).not.toMatch(/(?<!:where\()\.fl-space-x-2\\\/6 > :not\(:last-child\)/);
	});

	it('space-x-reverse can win over fluid spacing (same zero specificity → later wins)', async () => {
		const css = await run(['fl-space-x-2/6', 'space-x-reverse']);
		// Both rules must be zero-specificity :where() wrappers so the cascade order
		// (core sorts space-x-reverse AFTER space-x-*) lets the reverse flip the var.
		const fluid = css.indexOf(':where(.fl-space-x-2\\/6 > :not(:last-child))');
		const reverse = css.indexOf(':where(.space-x-reverse > :not(:last-child))');
		expect(fluid).toBeGreaterThan(-1);
		expect(reverse).toBeGreaterThan(-1);
		// The reverse rule (setting --tw-space-x-reverse:1) sorts after the fluid rule.
		expect(reverse).toBeGreaterThan(fluid);
		expect(rule(css, ':where(.space-x-reverse')).toContain('--tw-space-x-reverse: 1');
	});
});

describe('finding 2 — ring composition parity', () => {
	it('spread includes --tw-ring-offset-width and box-shadow is the full 5-layer stack', async () => {
		const css = await run(['fl-ring-2/4']);
		const body = rule(css, '.fl-ring-2\\/4');
		// Ring spread must add the offset width (so ring-offset-* widens the ring).
		expect(nows(body)).toContain(nows('+ var(--tw-ring-offset-width'));
		// Full core five-layer stack, in order.
		expect(nows(body)).toContain(nows('box-shadow: var(--tw-inset-shadow'));
		for (const layer of [
			'--tw-inset-shadow',
			'--tw-inset-ring-shadow',
			'--tw-ring-offset-shadow',
			'--tw-ring-shadow',
			'--tw-shadow',
		]) {
			expect(body).toContain(layer);
		}
	});

	it('composes with ring-offset-2, shadow-lg, inset-shadow-sm without stomping layers', async () => {
		const css = await run(['fl-ring-2/4', 'ring-offset-2', 'shadow-lg', 'inset-shadow-sm']);
		// The core utilities still set their own layer vars…
		expect(rule(css, '.ring-offset-2')).toContain('--tw-ring-offset-width: 2px');
		expect(rule(css, '.shadow-lg')).toContain('--tw-shadow:');
		expect(rule(css, '.inset-shadow-sm')).toContain('--tw-inset-shadow:');
		// …and the fluid ring's box-shadow references all of them, so nothing is dropped.
		const body = rule(css, '.fl-ring-2\\/4');
		expect(body).toContain('--tw-inset-shadow');
		expect(body).toContain('--tw-ring-offset-shadow');
		expect(body).toContain('--tw-shadow');
	});
});

describe('finding 1 — border/outline style parity', () => {
	it('fl-border-* emits the matching border-style var for its side, like core', async () => {
		const css = await run([
			'fl-border-2/4',
			'fl-border-x-2/4',
			'fl-border-y-2/4',
			'fl-border-s-2/4',
			'fl-border-t-2/4',
		]);
		// Core border-width utilities emit `<side>-style: var(--tw-border-style)` + width.
		expect(rule(css, '.fl-border-2\\/4')).toContain('border-style: var(--tw-border-style');
		expect(rule(css, '.fl-border-x-2\\/4')).toContain(
			'border-inline-style: var(--tw-border-style',
		);
		expect(rule(css, '.fl-border-y-2\\/4')).toContain(
			'border-block-style: var(--tw-border-style',
		);
		expect(rule(css, '.fl-border-s-2\\/4')).toContain(
			'border-inline-start-style: var(--tw-border-style',
		);
		expect(rule(css, '.fl-border-t-2\\/4')).toContain(
			'border-top-style: var(--tw-border-style',
		);
	});

	it('fl-border style declaration matches core border-2 (minus the width value)', async () => {
		const fluid = await run(['fl-border-2/4']);
		const core = await run(['border-2']);
		// Both must carry the border-style declaration; core relies on @property default,
		// the fluid root inlines `solid` so it also renders standalone.
		expect(rule(fluid, '.fl-border-2\\/4')).toContain('border-style: var(--tw-border-style');
		expect(rule(core, '.border-2')).toContain('border-style: var(--tw-border-style)');
	});

	it('fl-outline emits outline-style var like core outline-2', async () => {
		const css = await run(['fl-outline-2/4']);
		expect(rule(css, '.fl-outline-2\\/4')).toContain('outline-style: var(--tw-outline-style');
		expect(nows(rule(css, '.fl-outline-2\\/4'))).toContain('outline-width:clamp(');
	});
});

describe('emission hooks — structural smoke', () => {
	it('translate-x sets the transform var and drives the shorthand', async () => {
		const css = await run(['fl-translate-x-2/6']);
		expect(nows(css)).toContain('--tw-translate-x:clamp(');
		expect(css).toContain('translate: var(--tw-translate-x,0) var(--tw-translate-y,0)');
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
