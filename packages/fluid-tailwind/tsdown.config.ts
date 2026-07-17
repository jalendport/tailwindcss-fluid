import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	// dts disabled for the M0 throwaway spike: tailwindcss does not export the
	// `PluginWithOptions` type, so emitting a .d.ts for the default export trips
	// TS2742 (non-portable inferred type). A Tailwind plugin is consumed via
	// `@plugin "…"` in CSS, not imported as TS, so the type surface isn't needed
	// yet. Revisit in M1 with an explicit annotation or a hand-written .d.ts.
	dts: false,
	clean: true,
});
