import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `tailwind-merge` is an OPTIONAL peer: importing the plugin (the `.` entry) must
// never require it to be installed. Only the `src/tailwind-merge/` subpath entry may
// reference the package. This scans every source file OUTSIDE that folder and fails
// if any imports `tailwind-merge`, so the main entry can never gain a hard dependency
// on the optional peer through a stray import. Build-independent (reads source).

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith('.ts')) out.push(full);
	}
	return out;
}

describe('main entry stays free of the optional tailwind-merge peer', () => {
	it('no source file outside src/tailwind-merge imports tailwind-merge', () => {
		const srcDir = join(import.meta.dirname, '..', 'src');
		const offenders = walk(srcDir)
			.filter((f) => !f.includes(join('src', 'tailwind-merge')))
			.filter((f) => /from\s+['"]tailwind-merge['"]/.test(readFileSync(f, 'utf8')));
		expect(offenders).toEqual([]);
	});
});
