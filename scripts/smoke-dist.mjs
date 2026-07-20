// Built-artifact smoke test (M10 §6): import the emitted dist files directly and
// assert the runtime exports exist. `publint` + `@arethetypeswrong/cli` cover the
// package's `exports` map and its `.d.mts` types resolution; this covers the actual
// emitted JS, so a broken build (a missing default plugin export, a dropped
// `withFluid`, a bad `./tailwind-merge` dist path) fails CI before anything is
// published. Run after `pnpm build`.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'fluid-tailwind');
const mainPath = resolve(pkg, 'dist/index.mjs');
const mergePath = resolve(pkg, 'dist/tailwind-merge/index.mjs');

const errors = [];

for (const [label, path] of [
	['dist/index.mjs', mainPath],
	['dist/tailwind-merge/index.mjs', mergePath],
]) {
	if (!existsSync(path)) errors.push(`${label}: build artifact is missing — run \`pnpm build\``);
}

if (!errors.length) {
	const main = await import(mainPath);
	const merge = await import(mergePath);

	// The default export is the `plugin.withOptions(...)` result — a callable options
	// function carrying the plugin metadata. Accept function or object (v4 has varied).
	const plugin = main.default;
	if (plugin == null || (typeof plugin !== 'function' && typeof plugin !== 'object')) {
		errors.push('dist/index.mjs: default export (the plugin) is missing or not callable');
	}

	if (typeof merge.withFluid !== 'function') {
		errors.push('dist/tailwind-merge/index.mjs: `withFluid` export is missing');
	}
}

if (errors.length) {
	for (const e of errors) console.error('FAIL', e);
	process.exit(1);
}

console.log('dist smoke test: PASS — default plugin export + withFluid present in built artifacts');
