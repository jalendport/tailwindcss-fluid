// Ported from barvian/fluid-tailwind (MIT, © Maxwell Barvian)
// Length parsing. Adapted for Tailwind v4: `Length.parse` is stricter (a value
// must be a single length token — v3's broad `parseFloat(raw) === 0` shortcut
// wrongly accepted multi-token values like a `box-shadow` string as `0`), and
// `calc(<len> * -1)` (how v4 hands negated `-fl-*` values to the handler) is
// unwrapped before parsing.

export type RawValue = string | null | undefined;

// Please refer to MDN when updating this list:
// https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Values_and_units
// Only the ones that could also be valid media/container queries (i.e. no vw, cqw).
const lengthUnits = ['cm', 'mm', 'Q', 'in', 'pc', 'pt', 'px', 'em', 'ex', 'ch', 'rem', 'lh', 'rlh'];
// Ripped from Tailwind:
// https://github.com/tailwindlabs/tailwindcss/blob/master/src/util/dataTypes.js
const lengthRegExp = new RegExp(
	`^\\s*([+-]?[0-9]*\\.?[0-9]+(?:[eE][+-]?[0-9]+)?)(${lengthUnits.join('|')})\\s*$`,
);

// v4 negates `-fl-*` candidate values by wrapping them, e.g. `calc(0.75rem * -1)`.
const negatedCalc = /^\s*calc\(\s*(.+?)\s*\*\s*-1\s*\)\s*$/;

/**
 * Whether a candidate start value is v4's negated form (`calc(<len> * -1)`).
 * Used to detect negative mode structurally rather than from the parsed number,
 * which loses the sign for a zero start (`calc(0rem * -1)` parses to JS `-0`, and
 * `-0 < 0` is false). See the `-fl-p-0/3` regression.
 */
export const isNegated = (raw: unknown): boolean =>
	typeof raw === 'string' && negatedCalc.test(raw);

/** Strip v4's `calc(<x> * -1)` negation wrapper, returning the inner text (or `raw`). */
export const unnegate = (raw: string): string => negatedCalc.exec(raw)?.[1] ?? raw;

export class Length {
	constructor(
		public number: number,
		public unit?: string,
	) {}

	get cssText(): string {
		return `${this.number}${this.unit ?? ''}`;
	}

	static parse(raw: unknown): Length | null {
		if (raw === 0) return new Length(0);
		if (typeof raw !== 'string') return null;

		// Unwrap v4's negated form before matching.
		const neg = negatedCalc.exec(raw);
		if (neg) {
			const inner = Length.parse(neg[1]);
			return inner ? new Length(inner.number * -1, inner.unit) : null;
		}

		const trimmed = raw.trim();
		if (trimmed === '0') return new Length(0);

		const match = trimmed.match(lengthRegExp);
		if (!match) return null;
		const number = parseFloat(match[1] ?? '');
		return isNaN(number) ? null : new Length(number, match[2]);
	}
}
