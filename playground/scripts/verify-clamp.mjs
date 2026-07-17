// M0 check (6): prove the runtime clamp formula computes correctly in a real
// browser — including the `100cqw` swap for container ranges — by reading
// getComputedStyle at known viewport / container widths and comparing against
// hand-computed linear interpolation.
//
// Run: pnpm --filter playground test:e2e   (needs `npx playwright install chromium`)

import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = 16; // px per rem

// The runtime clamp evaluated at a given width (px) for an endpoint pair (rem)
// interpolated over a bp-min→bp-max range (rem). Mirrors the emitted formula:
//   lo + (hi - lo) * (vwRem - bpMin) / (bpMax - bpMin), clamped to [min, max].
const clampGeneric = (widthPx, loRem, hiRem, bpMinRem, bpMaxRem) => {
	const lo = loRem * ROOT;
	const hi = hiRem * ROOT;
	const raw = lo + (hi - lo) * ((widthPx - bpMinRem * ROOT) / ((bpMaxRem - bpMinRem) * ROOT));
	return Math.min(Math.max(raw, Math.min(lo, hi)), Math.max(lo, hi));
};

// Expected font-size (px) for `fl-text-sm/xl` (0.875rem→1.25rem).
const clampPx = (widthPx, bpMinRem, bpMaxRem) =>
	clampGeneric(widthPx, 0.875, 1.25, bpMinRem, bpMaxRem);

// Read a computed pixel value off an element.
const computed = (page, sel, prop = 'fontSize') =>
	page.evaluate(
		([s, p]) => parseFloat(getComputedStyle(document.querySelector(s))[p]),
		[sel, prop],
	);

const results = [];
const near = (label, actual, expected, tol = 0.75) => {
	const ok = Math.abs(actual - expected) <= tol;
	results.push({ label, actual: +actual.toFixed(3), expected: +expected.toFixed(3), ok });
};

const server = await createServer({
	root: new URL('..', import.meta.url).pathname,
	logLevel: 'error',
});
await server.listen();
const { port } = server.config.server;
const url = `http://localhost:${port}/`;

const browser = await chromium.launch();
try {
	const page = await browser.newPage();

	// --- viewport range (default 40rem→96rem) --------------------------------
	for (const w of [800, 1200]) {
		await page.setViewportSize({ width: w, height: 800 });
		await page.goto(url, { waitUntil: 'networkidle' });
		const fs = await page.evaluate(() =>
			parseFloat(getComputedStyle(document.querySelector('#viewport-type')).fontSize),
		);
		near(`viewport @ ${w}px`, fs, clampPx(w, 40, 96));
	}

	// --- container range (@fl-md/lg: 28rem→32rem, 100cqw) --------------------
	await page.setViewportSize({ width: 1400, height: 800 });
	await page.goto(url, { waitUntil: 'networkidle' });
	for (const cw of [480, 500]) {
		await page.evaluate((w) => {
			document.querySelector('#container').style.width = `${w}px`;
		}, cw);
		// allow container-query relayout
		await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
		const fs = await page.evaluate(() =>
			parseFloat(getComputedStyle(document.querySelector('#container-type')).fontSize),
		);
		near(`container @ ${cw}px (100cqw)`, fs, clampPx(cw, 28, 32));
	}

	// --- (M3) element-scope: `inherits: false` containment -------------------
	// A ranged parent (fl-md/lg: 48→64rem) must NOT leak its range to a child that
	// only carries the plain utility — the child falls back to the default range
	// (40→96rem). At 900px the two ranges give measurably different sizes.
	await page.setViewportSize({ width: 900, height: 800 });
	await page.goto(url, { waitUntil: 'networkidle' });

	const parentFs = await computed(page, '#scope-parent');
	const childFs = await computed(page, '#scope-child');
	near('element-scope: parent uses md/lg range', parentFs, clampPx(900, 48, 64));
	near('element-scope: child uses DEFAULT range (containment)', childFs, clampPx(900, 40, 96));
	// Redundant guard: the two must differ, or containment wouldn't be proven.
	near(
		'element-scope: parent ≠ child (range did not leak)',
		Math.abs(parentFs - childFs) > 0.5 ? 1 : 0,
		1,
	);

	// --- (M3) element-scope: one range variant retunes the WHOLE element ------
	// `#scope-element` has `fl-md/lg:fl-text-sm/xl fl-p-4/8`: the padding carries no
	// variant of its own, yet is ranged md/lg because the range vars are set on the
	// element. Compare against the default-range padding to prove the retune.
	const padTop = await computed(page, '#scope-element', 'paddingTop');
	near(
		'element-scope: sibling padding retuned to md/lg',
		padTop,
		clampGeneric(900, 1, 2, 48, 64),
	);

	// --- (M3) last-in-cascade-wins: two range variants on one element ---------
	// `#last-wins` has fl-sm/md (40→48rem) and fl-lg/2xl (64→96rem) on font-size.
	// They don't compose — the element takes exactly ONE range (cascade winner).
	// At 900px (56.25rem): sm/md is past its max → clamps to hi (1.25rem=20px);
	// lg/2xl is below its min → clamps to lo (0.875rem=14px). Distinct either way.
	const lastWinsFs = await computed(page, '#last-wins');
	const smMd = clampPx(900, 40, 48); // 20px (clamped to hi)
	const lgXl = clampPx(900, 64, 96); // 14px (clamped to lo)
	const def = clampPx(900, 40, 96); // ~17.08px — must NOT be this (no blend/default)
	const winner = Math.abs(lastWinsFs - smMd) < 0.5 ? 'fl-sm/md' : 'fl-lg/2xl';
	const matchesOne =
		Math.abs(lastWinsFs - smMd) < 0.5 || Math.abs(lastWinsFs - lgXl) < 0.5 ? 1 : 0;
	const notDefault = Math.abs(lastWinsFs - def) > 0.5 ? 1 : 0;
	near('last-wins: element takes exactly one range (no compose)', matchesOne, 1);
	near('last-wins: not the default/blended range', notDefault, 1);
	console.log(`  (last-wins cascade winner: ${winner}, got ${lastWinsFs.toFixed(2)}px)`);
} finally {
	await browser.close();
	await server.close();
}

let failed = 0;
for (const r of results) {
	const status = r.ok ? 'PASS' : 'FAIL';
	if (!r.ok) failed++;
	console.log(`[${status}] ${r.label}: got ${r.actual}px, expected ~${r.expected}px`);
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll browser clamp checks PASSED');
process.exit(failed ? 1 : 0);
