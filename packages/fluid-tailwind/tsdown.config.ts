import { defineConfig } from 'tsdown';

export default defineConfig({
	// Two entries: the plugin (`.`) and the tailwind-merge companion
	// (`./tailwind-merge`). Both emit dts.
	entry: ['src/index.ts', 'src/tailwind-merge/index.ts'],
	format: ['esm'],
	// Re-enabled for M1: the default export carries an explicit `PluginWithOptions`
	// annotation (see src/index.ts) so the emitted .d.ts no longer trips TS2742.
	dts: true,
	clean: true,
});
