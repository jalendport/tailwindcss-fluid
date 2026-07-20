import { describe, expect, it } from 'vitest';
import { run } from './harness';
import { Length } from '../src/css';
import { generate } from '../src/expr';
import type { FluidError } from '../src/errors';
import { resolveTheme } from '../src/theme';

/**
 * M1 engine tests. Assertions are against hand-computed clamps emitted through a
 * real Tailwind v4 compile (via the M0 harness), plus unit tests of the ported
 * expr math and theme resolution.
 */

/** Whitespace-insensitive haystack for matching emitted CSS values. */
const nows = (s: string) => s.replace(/\s+/g, '');

/** Stock default range (smallest/largest breakpoint) — the `var()` fallback numbers. */
const RANGE = { min: 40, max: 96 };

/**
 * Build the exact runtime clamp formula the emitter produces, including the inline
 * `var()` fallbacks (M10 §8): `--fl-vw` → `100vw`, `--fl-bp-min`/`--fl-bp-max` → the
 * stock default range (40 / 96).
 */
const clampStr = (lo: string, from: string, slope: string, hi: string, unit = 'rem') =>
	`clamp(${lo}${unit},calc(${from}${unit}+(${slope})*(var(--fl-vw,100vw)-var(--fl-bp-min,40)*1rem)/(var(--fl-bp-max,96)-var(--fl-bp-min,40))),${hi}${unit})`;

describe('expr.generate (ported v3 math)', () => {
	it('interpolates an increasing rem range', () => {
		expect(nows(generate(new Length(1, 'rem'), new Length(2, 'rem'), RANGE))).toBe(
			nows(clampStr('1', '1', '1', '2')),
		);
	});

	it('swaps clamp bounds for a decreasing range but keeps direction', () => {
		// start > end: min/max swap, slope stays negative
		expect(nows(generate(new Length(2, 'rem'), new Length(1, 'rem'), RANGE))).toBe(
			nows(clampStr('1', '2', '-1', '2')),
		);
	});

	it('lets zero adopt the other endpoint unit', () => {
		expect(nows(generate(new Length(0), new Length(2, 'rem'), RANGE))).toBe(
			nows(clampStr('0', '0', '2', '2')),
		);
		expect(nows(generate(new Length(2, 'rem'), new Length(0), RANGE))).toBe(
			nows(clampStr('0', '2', '-2', '2')),
		);
	});

	it('folds px endpoints to rem instead of erroring on unit difference', () => {
		// Per PLAN's unit-policy amendment px is rem-resolvable (folded at 16), so a
		// rem/px pair interpolates rather than raising mismatched-units.
		expect(nows(generate(new Length(1, 'rem'), new Length(32, 'px'), RANGE))).toBe(
			nows(clampStr('1', '1', '1', '2')),
		);
	});

	it('emits the resolved default range as inline var() fallbacks (M10 §8)', () => {
		// A custom range shows up as the fallback numbers, matching the @property init.
		const out = nows(
			generate(new Length(1, 'rem'), new Length(2, 'rem'), { min: 20, max: 80 }),
		);
		expect(out).toContain('var(--fl-vw,100vw)');
		expect(out).toContain('var(--fl-bp-min,20)');
		expect(out).toContain('var(--fl-bp-max,80)');
	});

	it('throws unsupported-unit for a non-rem-resolvable (em) endpoint', () => {
		try {
			generate(new Length(0.1, 'em'), new Length(0.2, 'em'), RANGE);
			throw new Error('should have thrown');
		} catch (e) {
			expect((e as FluidError).code).toBe('unsupported-unit');
		}
	});

	it('throws no-change when endpoints are equal', () => {
		try {
			generate(new Length(1, 'rem'), new Length(1, 'rem'), RANGE);
			throw new Error('should have thrown');
		} catch (e) {
			expect((e as FluidError).code).toBe('no-change');
		}
	});

	it('throws missing-end when the end value is absent', () => {
		try {
			generate(new Length(1, 'rem'), null, RANGE);
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

/**
 * M10 §4 — arbitrary and mixed `fl-text` pairs. These emit a font-size clamp ONLY;
 * line-height/letter-spacing sub-values interpolate only when BOTH endpoints are
 * named keys. Unit policy + SC 1.4.4 apply exactly as for named pairs.
 */
describe('M10 §4 — arbitrary fl-text pairs (size-only)', () => {
	/** Body of the first rule whose selector contains `needle`. */
	const rule = (css: string, needle: string): string => {
		const i = css.indexOf(needle);
		if (i === -1) return '';
		return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', css.indexOf('{', i)));
	};

	it('fl-text-[1rem]/[2rem] emits a font-size clamp and NO sub-values', async () => {
		const css = await run(['fl-text-[1rem]/[2rem]']);
		const body = rule(css, '.fl-text-\\[1rem\\]\\/\\[2rem\\]');
		expect(nows(body)).toContain(nows(`font-size:${clampStr('1', '1', '1', '2')}`));
		expect(body).not.toContain('line-height');
		expect(body).not.toContain('letter-spacing');
	});

	it('mixed fl-text-sm/[2rem] uses the named start size, size-only', async () => {
		const body = (await run(['fl-text-sm/[2rem]'])).match(
			/\.fl-text-sm\\\/\\\[2rem\\\]\s*\{[^}]*\}/,
		)?.[0];
		expect(nows(body ?? '')).toContain(
			nows(`font-size:${clampStr('0.875', '0.875', '1.125', '2')}`),
		);
		expect(body).not.toContain('line-height');
	});

	it('mixed fl-text-[1rem]/xl uses the named end size, size-only', async () => {
		const css = await run(['fl-text-[1rem]/xl']);
		const body = rule(css, '.fl-text-\\[1rem\\]\\/xl');
		// xl = 1.25rem, slope 0.25
		expect(nows(body)).toContain(nows(`font-size:${clampStr('1', '1', '0.25', '1.25')}`));
		expect(body).not.toContain('line-height');
	});

	it('px folds to rem in an arbitrary pair (fl-text-[16px]/[2rem])', async () => {
		const css = await run(['fl-text-[16px]/[2rem]']);
		const body = rule(css, '.fl-text-\\[16px\\]\\/\\[2rem\\]');
		expect(nows(body)).toContain(nows(`font-size:${clampStr('1', '1', '1', '2')}`));
	});

	it('unit policy applies: a non-rem arbitrary endpoint surfaces unsupported-unit', async () => {
		const css = await run(['fl-text-[1rem]/[2em]']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('unsupported-unit');
	});

	it('SC 1.4.4 applies exactly: an arbitrary pair too shallow is rejected', async () => {
		// 0.875rem→3rem over the default 40→96 range fails (the named sm/5xl analogue).
		const css = await run(['fl-text-[0.875rem]/[3rem]']);
		expect(css).toContain('fails-sc-144');
		expect(css).not.toMatch(/font-size:\s*clamp/);
	});

	it('the same arbitrary pair emits its font-size once SC 1.4.4 is disabled', async () => {
		const css = await run(['fl-text-[0.875rem]/[3rem]'], {
			pluginOptions: 'checkSC144: false;',
		});
		expect(css).toContain('font-size: clamp(');
		expect(css).not.toContain('fails-sc-144');
	});
});

describe('fl-p (dynamic spacing scale)', () => {
	it('resolves fl-p-4/8 as n x --spacing at build time', async () => {
		const css = await run(['fl-p-4/8']);
		expect(css).toContain('.fl-p-4\\/8');
		expect(nows(css)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
	});

	it('handles the -fl-m-3/5 negative in canonical dash-first form', async () => {
		// Margin (not padding) carries the negative — padding has no core negative,
		// so `fl-p` is registered non-negative per PLAN's negative policy.
		const css = await run(['-fl-m-3/5']);
		expect(css).toContain('.-fl-m-3\\/5');
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

	it('unsupported-unit when an endpoint is a non-rem-resolvable unit', async () => {
		const css = await run(['fl-p-[1rem]/[2em]']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('unsupported-unit');
	});
});

/**
 * Phase A — the Codex M1 review's exact failing inputs, now fixed.
 * (findings 1 & 2 in .briefs/review-m1-findings.md).
 */
describe('review finding 1 — unit policy (rem-resolvable only)', () => {
	it('folds px arbitrary endpoints to correct rem math (fl-p-[16px]/[32px])', async () => {
		// Was: clamp(16px, calc(16px + (16)*…rem…), 32px) — jumped to max early.
		// Now: 16px→1rem, 32px→2rem, emitted in rem.
		const css = await run(['fl-p-[16px]/[32px]']);
		expect(nows(css)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
		// The clamp is emitted purely in rem — no px leaks into the interpolation.
		expect(nows(css)).not.toContain('px,calc');
	});

	it('errors unsupported-unit for an em sub-value pair (fl-text)', async () => {
		// A custom font-size whose letter-spacing sub-values are em → can't interpolate.
		const css = await run(['fl-text-a/b'], {
			css: '@theme { --text-a: 1rem; --text-a--letter-spacing: 0.1em; --text-b: 2rem; --text-b--letter-spacing: 0.2em; }',
		});
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('unsupported-unit');
		// Font size itself still interpolates (rem).
		expect(nows(css)).toContain(nows(`font-size:${clampStr('1', '1', '1', '2')}`));
	});

	it('errors on a non-rem breakpoint option (min-screen in em)', async () => {
		// M10 §2: a present-but-non-rem option throws a configuration error naming the
		// option — config is intentional, so a bad unit fails loudly, not silently.
		await expect(run(['fl-p-4/8'], { pluginOptions: 'min-screen: 30em;' })).rejects.toThrow(
			/min-screen/,
		);
	});
});

/**
 * M10 §2 — option validation is consistent: present-but-invalid THROWS (a config
 * typo must fail the build), absent keeps the theme default.
 */
describe('M10 §2 — option consistency', () => {
	it('throws on unparseable junk (min-screen: bogus), no longer a silent fallback', async () => {
		await expect(run(['fl-p-4/8'], { pluginOptions: 'min-screen: bogus;' })).rejects.toThrow(
			/min-screen/,
		);
	});

	it('accepts a unitless number as rem (min-screen: 20)', async () => {
		const css = await run(['fl-p-4/8'], { pluginOptions: 'min-screen: 20;\nmax-screen: 80;' });
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*initial-value:\s*20/s);
		expect(css).toMatch(/@property --fl-bp-max\s*\{[^}]*initial-value:\s*80/s);
	});

	it('accepts a px length option (folded to rem)', async () => {
		const css = await run(['fl-p-4/8'], { pluginOptions: 'min-screen: 320px;' });
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*initial-value:\s*20/s);
	});

	it('throws on an invalid checkSC144 value (checkSC144: nope)', async () => {
		await expect(run(['fl-p-4/8'], { pluginOptions: 'checkSC144: nope;' })).rejects.toThrow(
			/checkSC144/,
		);
	});

	it('still honors checkSC144: false (the string the block hands through)', async () => {
		// fl-text-sm/5xl fails SC144 by default; disabling lets its font-size emit.
		const css = await run(['fl-text-sm/5xl'], { pluginOptions: 'checkSC144: false;' });
		expect(css).toContain('font-size: clamp(');
		expect(css).not.toContain('fails-sc-144');
	});
});

/**
 * M10 §1 — the @plugin option range must be strictly increasing (the default range
 * feeds the interpolation directly). Equal or inverted → throw a config error.
 */
describe('M10 §1 — option range validation', () => {
	it('throws on an equal option range (min-screen == max-screen)', async () => {
		await expect(
			run(['fl-p-4/8'], { pluginOptions: 'min-screen: 40rem;\nmax-screen: 40rem;' }),
		).rejects.toThrow();
	});

	it('throws on an inverted option range (min-screen > max-screen)', async () => {
		await expect(
			run(['fl-p-4/8'], { pluginOptions: 'min-screen: 96rem;\nmax-screen: 40rem;' }),
		).rejects.toThrow();
	});
});

/**
 * M10 §3 — the error surface is escaped for a CSS string context, so user text
 * containing `"` / `\` / newlines can't terminate the string early and emit
 * malformed CSS. `type: ['length','any']` lets a bracketed non-length reach the
 * handler, so a `"`-bearing arbitrary is a real vector.
 */
describe('M10 §3 — error surface escaping', () => {
	/** Extract the `--tw-fl-error` value (the CSS string) from emitted CSS. */
	const errorValue = (css: string): string | null => {
		const m = css.match(/--tw-fl-error:\s*("(?:[^"\\]|\\.)*")/);
		return m ? m[1]! : null;
	};

	it('a quote-bearing arbitrary start emits a single well-formed CSS string', async () => {
		const css = await run(['fl-p-["x"]/4']);
		const value = errorValue(css);
		expect(value).not.toBeNull();
		// It parses cleanly as a single JSON/CSS double-quoted string (the inner `"`
		// is escaped as `\"`), and carries the error code.
		const parsed = JSON.parse(value!) as string;
		expect(parsed).toContain('non-length-start');
		expect(parsed).toContain('"x"');
	});

	it('a quote-bearing theme token emits a single well-formed CSS string', async () => {
		const css = await run(['fl-p-x'], { css: '@theme { --fl-x: 2rem" 4rem; }' });
		const value = errorValue(css);
		expect(value).not.toBeNull();
		const parsed = JSON.parse(value!) as string;
		expect(parsed).toContain('token-not-pair');
		expect(parsed).toContain('2rem" 4rem');
	});
});

describe('review finding 2 — negative zero ranges', () => {
	// The reviewer's example was `-fl-p-0/3`, from M1 when `fl-p` was the only
	// (incorrectly negative-capable) root. Padding has no core negative, so the
	// identical negative-zero mechanism is verified on `fl-m`; the fix is
	// root-agnostic (structural `isNegated`, not a numeric sign check).
	it('-fl-m-0/3 stays negative (0 → -0.75rem)', async () => {
		const css = await run(['-fl-m-0/3']);
		expect(css).toContain('.-fl-m-0\\/3');
		// 0rem → -0.75rem, slope -0.75, clamp bounds swapped.
		expect(nows(css)).toContain(nows(clampStr('-0.75', '0', '-0.75', '0')));
	});

	it('-fl-m-0/0 is a no-change error, not a silent positive', async () => {
		const css = await run(['-fl-m-0/0']);
		expect(css).toContain('--tw-fl-error');
		expect(css).toContain('no-change');
	});
});

describe('review finding 4 — error-surface boundary', () => {
	/** The `@layer utilities` slice, where a generated `fl-` rule would appear. */
	const utils = (css: string) => css.split('@layer utilities')[1] ?? '';

	it('surfaces an error when the start parses but the end does not', async () => {
		// Valid length start → handler runs → non-length-end surfaced.
		expect(await run(['fl-p-4/foo'])).toContain('--tw-fl-error');
		expect(await run(['fl-p-[3px]/foo'])).toContain('--tw-fl-error');
	});

	it('surfaces an error for a bracketed non-length start (finding 6)', async () => {
		// With `type: ['length', 'any']` an arbitrary non-length start now reaches the
		// handler and surfaces a visible `non-length-start` error rather than vanishing.
		expect(await run(['fl-p-[foo]/4'])).toContain('non-length-start');
	});

	it('drops bareword and malformed candidates before the handler (documented boundary)', async () => {
		// An unknown bareword start (not in the value map) and a malformed slash never
		// reach the handler, so no rule and no --tw-fl-error is emitted for them.
		for (const c of ['fl-p-foo/4', 'fl-p-4/']) {
			const css = await run([c]);
			expect(css).not.toContain('--tw-fl-error');
			expect(/\.[^{]*fl-p/.test(utils(css))).toBe(false);
		}
	});
});
