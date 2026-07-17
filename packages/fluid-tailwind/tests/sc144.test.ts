import { describe, expect, it } from 'vitest';
import { run } from './harness';
import { assertSC144 } from '../src/sc144';
import { FluidError } from '../src/errors';

/**
 * WCAG SC 1.4.4 zoom-safety check (M4). Ported from v3's `expr.ts` SC144 block
 * and its `text.test.ts` scenarios, adapted to the v4 architecture: the check runs
 * against the DEFAULT range at utility generation (per-variant ranges are invisible
 * to the utility), and on failure the fluid font-size is REJECTED (no `font-size`
 * emitted, only the `--tw-fl-error` surface) while sub-values still generate.
 *
 * Note: our font-size handler is named-key only (M2), so — unlike v3's arbitrary
 * `~text-[1rem]/[2.6rem]` — these use named pairs. `fl-text-sm/5xl` (0.875→3rem
 * over the stock 40→96 range) is the analogue that fails at 200rem.
 */

const nows = (s: string) => s.replace(/\s+/g, '');
const rule = (css: string, sel: string) => {
	const i = css.indexOf(sel);
	if (i === -1) return '';
	return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', css.indexOf('{', i)));
};

// ---------------------------------------------------------------------------
// Pure math (ported v3 numbers) — the model, independent of the compile harness.
// ---------------------------------------------------------------------------
describe('assertSC144 (ported v3 math)', () => {
	it("v3's canonical failing pair 1rem→2.6rem over 40→96 fails at 200rem", () => {
		try {
			assertSC144(1, 2.6, 40, 96);
			throw new Error('should have thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(FluidError);
			expect((e as FluidError).code).toBe('fails-sc-144');
			expect((e as FluidError).message).toContain('200rem');
		}
	});

	it('a gentle pair (1rem→1.25rem over 40→96) passes', () => {
		expect(() => assertSC144(1, 1.25, 40, 96)).not.toThrow();
	});

	it('a wider default range can rescue a pair that fails the stock range', () => {
		// 1rem→2.6rem fails over 40→96 but passes over a smaller-start / larger-end
		// range (v3 "allows variants to fix" — here via the default-range options).
		expect(() => assertSC144(1, 2.6, 0.5, 120)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// End-to-end through the compiler.
// ---------------------------------------------------------------------------
describe('SC144 at utility generation', () => {
	it('rejects a failing font-size pair: no fluid font-size, only the error surface', async () => {
		const css = await run(['fl-text-sm/5xl']);
		const body = rule(css, '.fl-text-sm\\/5xl');
		expect(body).toContain('--tw-fl-error');
		expect(body).toContain('fails-sc-144');
		expect(body).toContain('200rem');
		// The fluid font-size must NOT be emitted (the utility is rejected).
		expect(body).not.toContain('font-size:');
	});

	it('still emits the line-height sub-value (v3-faithful: only font-size is gated)', async () => {
		const body = rule(await run(['fl-text-sm/5xl']), '.fl-text-sm\\/5xl');
		expect(nows(body)).toContain('line-height:clamp(');
	});

	it('a passing pair emits a fluid font-size with no error', async () => {
		const body = rule(await run(['fl-text-sm/xl']), '.fl-text-sm\\/xl');
		expect(nows(body)).toContain('font-size:clamp(');
		expect(body).not.toContain('--tw-fl-error');
	});

	it('checkSC144: false disables the check (font-size emitted, no error)', async () => {
		const css = await run(['fl-text-sm/5xl'], { pluginOptions: 'checkSC144: false' });
		const body = rule(css, '.fl-text-sm\\/5xl');
		expect(nows(body)).toContain('font-size:clamp(');
		expect(body).not.toContain('--tw-fl-error');
	});

	it('the check uses the default range, so min-screen/max-screen options move it', async () => {
		// Widening the default range to 0.5rem→120rem rescues the otherwise-failing
		// sm/5xl pair (the v4 analogue of v3 fixing a violation via the range).
		const css = await run(['fl-text-sm/5xl'], {
			pluginOptions: 'min-screen: 0.5rem;\nmax-screen: 120rem',
		});
		const body = rule(css, '.fl-text-sm\\/5xl');
		expect(nows(body)).toContain('font-size:clamp(');
		expect(body).not.toContain('fails-sc-144');
	});
});
