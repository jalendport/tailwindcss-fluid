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
	`clamp(${lo}rem,calc(${from}rem+(${slope})*(var(--fl-vw)-var(--fl-bp-min)*1rem)/(var(--fl-bp-max)-var(--fl-bp-min))),${hi}rem)`;
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
