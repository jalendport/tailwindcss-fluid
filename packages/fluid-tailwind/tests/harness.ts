import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { compile } from 'tailwindcss';

const require = createRequire(import.meta.url);

/** Resolve `@import` targets to real Tailwind stylesheet files on disk. */
async function loadStylesheet(id: string, base: string) {
	let path: string;
	if (id === 'tailwindcss') {
		path = resolve(dirname(require.resolve('tailwindcss/package.json')), 'index.css');
	} else if (id.startsWith('tailwindcss/')) {
		path = resolve(
			dirname(require.resolve('tailwindcss/package.json')),
			id.slice('tailwindcss/'.length),
		);
	} else {
		path = resolve(base, id);
	}
	return { base: dirname(path), path, content: await readFile(path, 'utf-8') };
}

export interface CompileOptions {
	/** Extra CSS appended after the `@import 'tailwindcss'` + `@plugin` lines. */
	css?: string;
	/** Options block body passed inside `@plugin "…" { … }`. */
	pluginOptions?: string;
}

/**
 * Compile a list of candidate classes against a real Tailwind v4 instance with
 * the fluid plugin loaded, and return the emitted CSS.
 *
 * The plugin is resolved from source through the workspace so the harness stays
 * in lockstep with the code under test. This is the permanent unit-test entry
 * point referenced by every milestone.
 */
export async function run(candidates: string[], options: CompileOptions = {}): Promise<string> {
	const pluginBlock = options.pluginOptions
		? `@plugin "fluid" {\n${options.pluginOptions}\n}`
		: `@plugin "fluid";`;

	const input = [`@import 'tailwindcss';`, pluginBlock, options.css ?? ''].join('\n');

	const compiler = await compile(input, {
		base: import.meta.dirname,
		loadStylesheet,
		loadModule: async (id, _base, _resourceHint) => {
			if (id === 'fluid' || id === 'tailwindcss-fluid') {
				const mod = (await import('../src/index.ts')) as { default: unknown };
				return { path: id, base: import.meta.dirname, module: mod.default };
			}
			throw new Error(`Unexpected module request: ${id}`);
		},
	});

	return compiler.build(candidates);
}
