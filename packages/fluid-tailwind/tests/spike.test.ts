import { describe, expect, it } from 'vitest';
import { run } from './harness';

/**
 * M0 spike assertions. These lock in the load-bearing assumptions from
 * PLAN.md's M0 against a real Tailwind v4 compile. Prototype coverage — M1
 * replaces the plugin, but this harness pattern is permanent.
 */

const CLAMP = /clamp\(.*var\(--fl-vw\).*var\(--fl-bp-min\).*var\(--fl-bp-max\).*\)/s;

describe('M0 spike', () => {
	it('(1) fl-text-sm/xl compiles with slash modifier and is scanned', async () => {
		const css = await run(['fl-text-sm/xl']);
		expect(css).toContain('.fl-text-sm\\/xl');
		expect(css).toMatch(CLAMP);
		// endpoints inlined at build time: sm=0.875rem, xl=1.25rem
		expect(css).toContain('clamp(0.875rem');
		expect(css).toContain('1.25rem)');
	});

	it('(2) -fl-mt-3/5 registers as a negative in canonical -fl- form', async () => {
		const css = await run(['-fl-mt-3/5']);
		expect(css).toContain('.-fl-mt-3\\/5');
		expect(css).toContain('margin-top');
		// both endpoints negative: -0.75rem .. -1.25rem
		expect(css).toContain('-0.75rem');
		expect(css).toContain('-1.25rem');
	});

	it('(3) fl range variants inject --fl-bp-* beside @slot', async () => {
		const css = await run([
			'fl-md/lg:fl-text-sm/xl',
			'fl-md:fl-text-sm/xl',
			'fl/lg:fl-text-sm/xl',
		]);
		// md/lg -> 48/64
		expect(css).toMatch(/\.fl-md\\\/lg\\:fl-text-sm\\\/xl\s*\{[^}]*--fl-bp-min:\s*48/s);
		expect(css).toMatch(/\.fl-md\\\/lg\\:fl-text-sm\\\/xl\s*\{[^}]*--fl-bp-max:\s*64/s);
		// md only -> 48 / default-max 96
		expect(css).toMatch(/\.fl-md\\:fl-text-sm\\\/xl\s*\{[^}]*--fl-bp-max:\s*96/s);
		// /lg only -> default-min 40 / 64
		expect(css).toMatch(/\.fl\\\/lg\\:fl-text-sm\\\/xl\s*\{[^}]*--fl-bp-min:\s*40/s);
	});

	it('(4) @fl container variants emit 100cqw; --container-fl does not collide', async () => {
		const css = await run(['@fl-md/lg:fl-text-sm/xl', '@fl/lg:fl-text-sm/xl'], {
			css: '@theme { --container-fl: 30rem; }',
		});
		expect(css).toContain('.\\@fl-md\\/lg\\:fl-text-sm\\/xl');
		expect(css).toContain('--fl-vw: 100cqw');
		// container md=28rem lg=32rem
		expect(css).toMatch(/--fl-bp-min:\s*28/);
		expect(css).toMatch(/--fl-bp-max:\s*32/);
		// still compiles cleanly with a user --container-fl token present
		expect(css).toContain('.\\@fl\\/lg\\:fl-text-sm\\/xl');
	});

	it('(5) @property engine variables land at root with inherits:false', async () => {
		const css = await run(['fl-text-sm/xl']);
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*syntax:\s*"<number>"/s);
		expect(css).toMatch(/@property --fl-vw\s*\{[^}]*syntax:\s*"<length-percentage>"/s);
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*inherits:\s*false/s);
		expect(css).toMatch(/@property --fl-vw\s*\{[^}]*initial-value:\s*100vw/s);
		// default range from stock breakpoints: 40 .. 96
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*initial-value:\s*40/s);
		expect(css).toMatch(/@property --fl-bp-max\s*\{[^}]*initial-value:\s*96/s);
	});

	it('(8) @plugin option block overrides min/max-screen', async () => {
		const css = await run(['fl-text-sm/xl'], {
			pluginOptions: 'min-screen: 20rem;\nmax-screen: 80rem;',
		});
		expect(css).toMatch(/@property --fl-bp-min\s*\{[^}]*initial-value:\s*20/s);
		expect(css).toMatch(/@property --fl-bp-max\s*\{[^}]*initial-value:\s*80/s);
	});

	it('(9) error text carried in a declaration value survives the compat layer', async () => {
		const css = await run(['fl-err-test']);
		expect(css).toContain('--fl-error');
		expect(css).toContain('mismatched-units');
	});
});
