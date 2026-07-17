import { describe, expect, it } from 'vitest';
import { run } from './harness';
import { Length } from '../src/css';
import { generate } from '../src/expr';
import { FluidError } from '../src/errors';
import { resolveTheme } from '../src/theme';

/**
 * M1 engine tests. Assertions are against hand-computed clamps emitted through a
 * real Tailwind v4 compile (via the M0 harness), plus unit tests of the ported
 * expr math and theme resolution.
 */

/** Whitespace-insensitive haystack for matching emitted CSS values. */
const nows = (s: string) => s.replace(/\s+/g, '');

/** Build the exact runtime clamp formula the emitter produces. */
const clampStr = (lo: string, from: string, slope: string, hi: string, unit = 'rem') =>
	`clamp(${lo}${unit},calc(${from}${unit}+(${slope})*(var(--fl-vw)-var(--fl-bp-min)*1rem)/(var(--fl-bp-max)-var(--fl-bp-min))),${hi}${unit})`;

describe('expr.generate (ported v3 math)', () => {
	it('interpolates an increasing rem range', () => {
		expect(nows(generate(new Length(1, 'rem'), new Length(2, 'rem')))).toBe(
			nows(clampStr('1', '1', '1', '2')),
		);
	});

	it('swaps clamp bounds for a decreasing range but keeps direction', () => {
		// start > end: min/max swap, slope stays negative
		expect(nows(generate(new Length(2, 'rem'), new Length(1, 'rem')))).toBe(
			nows(clampStr('1', '2', '-1', '2')),
		);
	});

	it('lets zero adopt the other endpoint unit', () => {
		expect(nows(generate(new Length(0), new Length(2, 'rem')))).toBe(
			nows(clampStr('0', '0', '2', '2')),
		);
		expect(nows(generate(new Length(2, 'rem'), new Length(0)))).toBe(
			nows(clampStr('0', '2', '-2', '2')),
		);
	});

	it('throws mismatched-units on differing units', () => {
		expect(() => generate(new Length(1, 'rem'), new Length(1, 'px'))).toThrowError(FluidError);
		try {
			generate(new Length(1, 'rem'), new Length(2, 'px'));
		} catch (e) {
			expect((e as FluidError).code).toBe('mismatched-units');
		}
	});

	it('throws no-change when endpoints are equal', () => {
		try {
			generate(new Length(1, 'rem'), new Length(1, 'rem'));
			throw new Error('should have thrown');
		} catch (e) {
			expect((e as FluidError).code).toBe('no-change');
		}
	});

	it('throws missing-end when the end value is absent', () => {
		try {
			generate(new Length(1, 'rem'), null);
			throw new Error('should have thrown');
		} catch (e) {
			expect((e as FluidError).code).toBe('missing-end');
		}
	});
});

describe('css.Length (ported, v4-hardened)', () => {
	it('unwraps v4 negated calc form', () => {
		const l = Length.parse('calc(0.75rem * -1)');
		expect(l?.number).toBe(-0.75);
		expect(l?.unit).toBe('rem');
	});

	it('rejects multi-token values that start with 0 (box-shadow etc.)', () => {
		expect(Length.parse('0px 1px 0px rgb(0 0 0 / 0.15)')).toBeNull();
	});

	it('rejects unitless numbers', () => {
		expect(Length.parse('1.5')).toBeNull();
	});
});

describe('theme resolution', () => {
	const mockTheme =
		(over: Record<string, unknown> = {}) =>
		(path: string): unknown => {
			const base: Record<string, unknown> = {
				breakpoint: { sm: '40rem', lg: '64rem', __CSS_VALUES__: {} },
				containers: { md: '28rem', lg: '32rem', __CSS_VALUES__: {} },
				spacing: { '4': '1rem', '8': '2rem' },
				fontSize: {},
			};
			return { ...base, ...over }[path];
		};

	it('derives default range from smallest/largest breakpoint', () => {
		const t = resolveTheme(mockTheme());
		expect(t.defaultMin).toBe(40);
		expect(t.defaultMax).toBe(64);
	});

	it('resolves a named breakpoint to a unitless rem number', () => {
		const t = resolveTheme(mockTheme());
		expect(t.resolveBreakpoint('breakpoint', 'lg')).toBe(64);
		expect(t.resolveBreakpoint('containers', 'md')).toBe(28);
	});

	it('errors bp-not-found on a missing named breakpoint', () => {
		const t = resolveTheme(mockTheme());
		try {
			t.resolveBreakpoint('breakpoint', 'nope');
			throw new Error('should have thrown');
		} catch (e) {
			expect((e as FluidError).code).toBe('bp-not-found');
		}
	});
});

describe('fl-text (font-size tuple interpolation)', () => {
	it('interpolates font-size and line-height for sm/xl', async () => {
		const css = await run(['fl-text-sm/xl']);
		expect(css).toContain('.fl-text-sm\\/xl');
		// font-size: 0.875rem -> 1.25rem, slope 0.375
		expect(nows(css)).toContain(
			nows(`font-size:${clampStr('0.875', '0.875', '0.375', '1.25')}`),
		);
		// line-height: sm ratio*size = 1.25rem -> xl 1.75rem, slope 0.5
		expect(nows(css)).toContain(nows(`line-height:${clampStr('1.25', '1.25', '0.5', '1.75')}`));
	});

	it('errors mismatched-font-weights while still emitting font-size', async () => {
		const css = await run(['fl-text-a/b'], {
			css: '@theme { --text-a: 1rem; --text-a--font-weight: 400; --text-b: 2rem; --text-b--font-weight: 700; }',
		});
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('mismatched-font-weights');
		// font-size still interpolates 1rem -> 2rem
		expect(nows(css)).toContain(nows(clampStr('1', '1', '1', '2')));
	});
});

describe('fl-p (dynamic spacing scale)', () => {
	it('resolves fl-p-4/8 as n x --spacing at build time', async () => {
		const css = await run(['fl-p-4/8']);
		expect(css).toContain('.fl-p-4\\/8');
		expect(nows(css)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
	});

	it('handles the -fl-p-3/5 negative in canonical dash-first form', async () => {
		const css = await run(['-fl-p-3/5']);
		expect(css).toContain('.-fl-p-3\\/5');
		// both endpoints negative: -0.75rem .. -1.25rem, slope -0.5
		expect(nows(css)).toContain(nows(clampStr('-1.25', '-0.75', '-0.5', '-0.75')));
	});

	it('clamps a decreasing range fl-p-8/4 correctly', async () => {
		const css = await run(['fl-p-8/4']);
		expect(nows(css)).toContain(nows(clampStr('1', '2', '-1', '2')));
	});
});

describe('@plugin option overrides', () => {
	it('min-screen / max-screen change the engine @property defaults', async () => {
		const css = await run(['fl-p-4/8'], {
			pluginOptions: 'min-screen: 20rem;\nmax-screen: 80rem;',
		});
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*initial-value:\s*20/s);
		expect(css).toMatch(/@property --fl-bp-max\s*\{[^}]*initial-value:\s*80/s);
	});

	it('defaults to the theme breakpoint range with no option block', async () => {
		const css = await run(['fl-p-4/8']);
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*initial-value:\s*40/s);
		expect(css).toMatch(/@property --fl-bp-max\s*\{[^}]*initial-value:\s*96/s);
		expect(css).toMatch(/@property --fl-vw\s*\{[^}]*initial-value:\s*100vw/s);
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*inherits:\s*false/s);
	});
});

describe('error surface (--tw-fl-error, never null)', () => {
	it('missing-end when a fluid utility has no /end modifier', async () => {
		const css = await run(['fl-text-sm']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('missing-end');
	});

	it('no-change when start and end are identical', async () => {
		const css = await run(['fl-p-4/4']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('no-change');
	});

	it('mismatched-units when endpoints use different units', async () => {
		const css = await run(['fl-p-4/px']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('mismatched-units');
	});
});
