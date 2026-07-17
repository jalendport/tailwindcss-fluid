// Ported from barvian/fluid-tailwind (MIT, © Maxwell Barvian)
// Pure numeric helpers used by the clamp-formula emitter.

const formatters: Record<number, Intl.NumberFormat> = {};

/** Format `num` to at most `precision` fraction digits, without grouping. */
export const toPrecision = (num: number, precision: number): string =>
	(formatters[precision] ??= new Intl.NumberFormat('en-US', {
		maximumFractionDigits: precision,
		useGrouping: false,
	})).format(num);

/** Count the number of decimal places in `num`. */
export const precision = (num: number): number => {
	if (Math.floor(num.valueOf()) === num.valueOf()) return 0;
	return num.toString().split('.')?.[1]?.length || 0;
};

/** Clamp `n` into the `[min, max]` range. */
export const clamp = (min: number, n: number, max: number): number =>
	Math.min(Math.max(n, min), max);
