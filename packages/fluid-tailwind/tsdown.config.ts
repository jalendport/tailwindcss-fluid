import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	// Re-enabled for M1: the default export carries an explicit `PluginWithOptions`
	// annotation (see src/index.ts) so the emitted .d.ts no longer trips TS2742.
	dts: true,
	clean: true,
});
