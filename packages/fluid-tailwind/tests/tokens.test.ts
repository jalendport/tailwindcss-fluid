import { describe, expect, it } from 'vitest';
import { run } from './harness';

/**
 * Fluid theme tokens (M4). A token is a space-separated rem-resolvable pair under
 * the `--fl-*` namespace in `@theme`; used in a fluid utility's value position with
 * NO slash end it expands to that start/end range. Grammar decided in M4 (PLAN left
 * the shape to this milestone).
 */

const nows = (s: string) => s.replace(/\s+/g, '');
const clampStr = (lo: string, from: string, slope: string, hi: string) =>
	`clamp(${lo}rem,calc(${from}rem+(${slope})*(var(--fl-vw,100vw)-var(--fl-bp-min,40)*1rem)/(var(--fl-bp-max,96)-var(--fl-bp-min,40))),${hi}rem)`;
const rule = (css: string, sel: string) => {
	const i = css.indexOf(sel);
	if (i === -1) return '';
	return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', css.indexOf('{', i)));
};

const THEME = `@theme {
	--fl-display: 2rem 4rem;
	--fl-gutter: 0.5rem 2rem;
	--fl-px: 16px 32px;
	--fl-single: 2rem;
	--fl-triple: 1rem 2rem 3rem;
	--fl-em: 1em 2em;
}`;
const withTheme = (candidates: string[]) => run(candidates, { css: THEME });

describe('valid tokens expand to a range with no slash end', () => {
	it('fl-p-gutter interpolates the token pair (0.5rem → 2rem)', async () => {
		const css = await withTheme(['fl-p-gutter']);
		expect(nows(rule(css, '.fl-p-gutter'))).toContain(
			nows(`padding:${clampStr('0.5', '0.5', '1.5', '2')}`),
		);
	});

	it('a spacing-scale value and a token coexist on the same root', async () => {
		const css = await withTheme(['fl-p-4/8', 'fl-p-gutter']);
		expect(css).toContain('.fl-p-4\\/8');
		expect(css).toContain('.fl-p-gutter');
		expect(css).not.toContain('--tw-fl-error');
	});

	it('fl-text-display supplies the SIZE pair only (no line-height tuple)', async () => {
		const body = rule(await withTheme(['fl-text-display']), '.fl-text-display');
		expect(nows(body)).toContain(nows(`font-size:${clampStr('2', '2', '2', '4')}`));
		// A token has no tuple, so line-height falls back to static (not emitted).
		expect(body).not.toContain('line-height');
	});

	it('px token folds to rem (16px 32px → 1rem/2rem)', async () => {
		const body = rule(await withTheme(['fl-p-px']), '.fl-p-px');
		expect(nows(body)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
	});

	it('a token negates on a negative-capable root (-fl-m-gutter)', async () => {
		const body = rule(await withTheme(['-fl-m-gutter']), '.-fl-m-gutter');
		expect(nows(body)).toContain(nows(`margin:${clampStr('-2', '-0.5', '-1.5', '-0.5')}`));
	});

	it('the token appears across roots (fl-gap-gutter)', async () => {
		const body = rule(await withTheme(['fl-gap-gutter']), '.fl-gap-gutter');
		expect(nows(body)).toContain('gap:clamp(');
	});
});

describe('token error cases surface --tw-fl-error', () => {
	it('slash + token end (fl-p-4/gutter) → token-as-end', async () => {
		const body = rule(await withTheme(['fl-p-4/gutter']), '.fl-p-4\\/gutter');
		expect(body).toContain('token-as-end');
	});

	it('token + slash end (fl-p-gutter/8) → token-with-end', async () => {
		const body = rule(await withTheme(['fl-p-gutter/8']), '.fl-p-gutter\\/8');
		expect(body).toContain('token-with-end');
	});

	it('a 1-value token (fl-p-single) → missing-end (not a pair)', async () => {
		const body = rule(await withTheme(['fl-p-single']), '.fl-p-single');
		expect(body).toContain('missing-end');
	});

	it('a 3-value token (fl-p-triple) → token-not-pair', async () => {
		const body = rule(await withTheme(['fl-p-triple']), '.fl-p-triple');
		expect(body).toContain('token-not-pair');
	});

	it('a non-rem token (fl-p-em) → unsupported-unit (unit policy applies)', async () => {
		const body = rule(await withTheme(['fl-p-em']), '.fl-p-em');
		expect(body).toContain('unsupported-unit');
	});

	it('a calc() token endpoint → token-not-pair with a literal-lengths message (finding 6)', async () => {
		const body = rule(
			await run(['fl-p-calc'], { css: `@theme { --fl-calc: calc(1rem + 1rem) 4rem; }` }),
			'.fl-p-calc',
		);
		expect(body).toContain('token-not-pair');
		expect(body).toContain('literal rem/px lengths');
	});
});

describe('CSS length units are case-insensitive (finding 6)', () => {
	it('an uppercase-unit token (2REM 4REM) resolves like lowercase', async () => {
		const body = rule(
			await run(['fl-p-caps'], { css: `@theme { --fl-caps: 2REM 4REM; }` }),
			'.fl-p-caps',
		);
		expect(nows(body)).toContain(nows(`padding:${clampStr('2', '2', '2', '4')}`));
	});

	it('an uppercase-unit arbitrary pair (fl-p-[16PX]/[2rem]) folds px→rem', async () => {
		const body = rule(await run(['fl-p-[16PX]/[2rem]']), '.fl-p-\\[16PX\\]\\/\\[2rem\\]');
		expect(nows(body)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
	});
});

describe('token/scale name collisions resolve consistently (finding 4)', () => {
	// Policy: a SLASH pair always resolves the real scale; the NO-SLASH form resolves
	// the token. Applied identically to length and font-size roots.
	const LEN = `@theme { --fl-4: 1rem 2rem; }`;
	const FONT = `@theme { --fl-sm: 1rem 2rem; }`;

	it('length slash pair uses the real spacing scale (fl-p-4/8 → 1rem→2rem)', async () => {
		const body = rule(await run(['fl-p-4/8'], { css: LEN }), '.fl-p-4\\/8');
		expect(nows(body)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
		expect(body).not.toContain('--tw-fl-error');
	});

	it('length no-slash form uses the token (fl-p-4 → 1rem→2rem token)', async () => {
		const body = rule(await run(['fl-p-4'], { css: LEN }), '.fl-p-4 ');
		expect(nows(body)).toContain(nows(`padding:${clampStr('1', '1', '1', '2')}`));
	});

	it('font-size slash pair uses the text scale (fl-text-sm/xl → 0.875→1.25)', async () => {
		const body = rule(await run(['fl-text-sm/xl'], { css: FONT }), '.fl-text-sm\\/xl');
		expect(nows(body)).toContain(
			nows(`font-size:${clampStr('0.875', '0.875', '0.375', '1.25')}`),
		);
	});

	it('font-size no-slash form uses the token (fl-text-sm → 1rem→2rem token)', async () => {
		const body = rule(await run(['fl-text-sm'], { css: FONT }), '.fl-text-sm ');
		expect(nows(body)).toContain(nows(`font-size:${clampStr('1', '1', '1', '2')}`));
	});
});

describe('IntelliSense enumeration safety', () => {
	it('every token candidate across roots emits a declaration (never null)', async () => {
		// The language server enumerates every utility value with no modifier; a token
		// value must always yield a rule (a clamp or an error), never crash the build.
		const css = await withTheme([
			'fl-p-display',
			'fl-m-display',
			'fl-w-display',
			'fl-text-display',
			'fl-rounded-gutter',
			'fl-p-triple',
		]);
		for (const sel of [
			'.fl-p-display',
			'.fl-m-display',
			'.fl-w-display',
			'.fl-text-display',
			'.fl-rounded-gutter',
			'.fl-p-triple',
		]) {
			expect(css).toContain(sel);
		}
	});
});
