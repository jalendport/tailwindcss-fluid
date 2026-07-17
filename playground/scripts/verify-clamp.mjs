// M0 check (6): prove the runtime clamp formula computes correctly in a real
// browser — including the `100cqw` swap for container ranges — by reading
// getComputedStyle at known viewport / container widths and comparing against
// hand-computed linear interpolation.
//
// Run: pnpm --filter playground test:e2e   (needs `npx playwright install chromium`)

import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = 16; // px per rem

// Expected font-size (px) for `fl-text-sm/xl` (0.875rem→1.25rem, slope 0.375).
const clampPx = (widthPx, bpMinRem, bpMaxRem) => {
	const lo = 0.875 * ROOT;
	const hi = 1.25 * ROOT;
	const raw = lo + 0.375 * ((widthPx - bpMinRem * ROOT) / (bpMaxRem - bpMinRem));
	return Math.min(Math.max(raw, lo), hi);
};

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
