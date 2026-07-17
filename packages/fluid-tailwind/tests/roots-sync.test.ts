import { describe, expect, it } from 'vitest';
import { ROOTS } from '../src/roots';
// Cross-package import (test-only): the tailwind-merge companion bundles the
// plugin's root surface as a static allowlist so `withFluid` never groups a class
// whose root the plugin can't emit. This test asserts the two lists stay in sync, so
// adding a root here without regenerating the companion fails CI.
import { FLUID_ROOTS } from '../../tailwind-merge/src/roots';

describe('tailwind-merge companion root allowlist stays in sync with the plugin', () => {
	it('FLUID_ROOTS equals every plugin root with `fl-` stripped', () => {
		const fromPlugin = [...new Set(ROOTS.map((r) => r.root.replace(/^fl-/, '')))].sort();
		const fromCompanion = [...FLUID_ROOTS].sort();
		expect(fromCompanion).toEqual(fromPlugin);
	});
});
