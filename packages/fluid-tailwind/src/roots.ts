// The full fluid root list (PLAN "Utility registration" + M2 brief). Every
// length-accepting core root is wired here as pure config — a scale family, the
// CSS properties (or an emission hook), and negative support — so the factory in
// `utilities.ts` needs no per-root handlers.
//
// v4 property notes: logical properties mirror core (`px` → `padding-inline`,
// `ps` → `padding-inline-start`, `inset-x` → `inset-inline`, `start` →
// `inset-inline-start`, `gap-x` → `column-gap`). Sizing and most spacing roots
// share the `spacing` scale (their numeric keys resolve through `--spacing`).

import type { Emitter, UtilityRoot } from './utilities';

// --- Emission hooks for roots that need more than a flat property list ---------

/**
 * `space-x`/`space-y`: margin on all-but-last child, honoring the reverse var.
 *
 * The child rule is wrapped in `:where(…)` so it carries ZERO added specificity,
 * exactly like core's `:where(.space-x-4 > :not(:last-child))` (review finding 3).
 * Without it the plain `.fl-space-x-2\/6 > :not(:last-child)` selector out-specifies
 * core's `:where(.space-x-reverse > :not(:last-child))`, so `--tw-space-x-reverse: 0`
 * always won and `space-x-reverse` could never flip fluid spacing.
 */
const space = (axis: 'x' | 'y'): Emitter => {
	const [reverse, startProp, endProp] =
		axis === 'x'
			? ['--tw-space-x-reverse', 'margin-inline-start', 'margin-inline-end']
			: ['--tw-space-y-reverse', 'margin-block-start', 'margin-block-end'];
	return (clamp) => ({
		':where(& > :not(:last-child))': {
			[reverse]: '0',
			[startProp]: `calc(${clamp} * var(${reverse}))`,
			[endProp]: `calc(${clamp} * calc(1 - var(${reverse})))`,
		},
	});
};

/** `translate-x`/`translate-y`: set one transform var, drive the `translate` property. */
const translate = (axis: 'x' | 'y'): Emitter => {
	const varName = axis === 'x' ? '--tw-translate-x' : '--tw-translate-y';
	return (clamp) => ({
		[varName]: clamp,
		// Inline var fallbacks (`,0`) keep the shorthand valid without an @property.
		translate: 'var(--tw-translate-x,0) var(--tw-translate-y,0)',
	});
};

/**
 * `ring`: fluid ring width mirroring core's ring emitter (review finding 2).
 *
 * Two parity points core relies on:
 *   • the ring spread is `calc(<width> + var(--tw-ring-offset-width))`, so
 *     `ring-offset-*` widens the outer ring, not just the offset shadow;
 *   • the full FIVE-layer core `box-shadow` stack (`--tw-inset-shadow`,
 *     `--tw-inset-ring-shadow`, `--tw-ring-offset-shadow`, `--tw-ring-shadow`,
 *     `--tw-shadow`) so combining with inset-shadow / inset-ring / shadow doesn't
 *     stomp those layers.
 *
 * Core references these vars bare and leans on its own `@property` base-layer
 * defaults (`--tw-ring-offset-width: 0px`, the shadow layers `0 0 #0000`). Using
 * `fl-ring` standalone (no core ring utility) wouldn't emit those registrations, so
 * we keep inline fallbacks matching core's initial-values — harmless when a core
 * utility sets the var (the set value wins), correct when it doesn't. This composes
 * with core's own registrations; see m4-results.
 */
const ring: Emitter = (clamp) => ({
	'--tw-ring-shadow': `var(--tw-ring-inset,) 0 0 0 calc(${clamp} + var(--tw-ring-offset-width, 0px)) var(--tw-ring-color, currentcolor)`,
	'box-shadow': [
		'var(--tw-inset-shadow, 0 0 #0000)',
		'var(--tw-inset-ring-shadow, 0 0 #0000)',
		'var(--tw-ring-offset-shadow, 0 0 #0000)',
		'var(--tw-ring-shadow, 0 0 #0000)',
		'var(--tw-shadow, 0 0 #0000)',
	].join(', '),
});

/**
 * A width root that also emits its matching core `*-style: var(--tw-*-style)`
 * declaration (review finding 1) — the border/outline width utilities are useless
 * without the style, since the CSS initial style is `none`. Core emits the style
 * first, then the width; we match that order. The style var carries an inline
 * `solid` fallback (core's `@property` initial-value) so a standalone `fl-border-*`
 * / `fl-outline` renders without a separate core style utility.
 */
const styledWidth =
	(styleProp: string, styleVar: string, widthProp: string): Emitter =>
	(clamp) => ({
		[styleProp]: `var(${styleVar}, solid)`,
		[widthProp]: clamp,
	});

/** A border-width root: the correct logical/physical style + width pair for a side. */
const borderSide = (root: string, styleProp: string, widthProp: string): UtilityRoot => ({
	root,
	scale: 'borderWidth',
	emit: styledWidth(styleProp, '--tw-border-style', widthProp),
});

// --- Root config ---------------------------------------------------------------

/** A spacing-scale length root (the common case). */
const sp = (root: string, properties: string[], negative = false): UtilityRoot => ({
	root,
	properties,
	negative,
});

export const ROOTS: UtilityRoot[] = [
	// Padding
	sp('fl-p', ['padding']),
	sp('fl-px', ['padding-inline']),
	sp('fl-py', ['padding-block']),
	sp('fl-ps', ['padding-inline-start']),
	sp('fl-pe', ['padding-inline-end']),
	sp('fl-pt', ['padding-top']),
	sp('fl-pr', ['padding-right']),
	sp('fl-pb', ['padding-bottom']),
	sp('fl-pl', ['padding-left']),

	// Margin (negative)
	sp('fl-m', ['margin'], true),
	sp('fl-mx', ['margin-inline'], true),
	sp('fl-my', ['margin-block'], true),
	sp('fl-ms', ['margin-inline-start'], true),
	sp('fl-me', ['margin-inline-end'], true),
	sp('fl-mt', ['margin-top'], true),
	sp('fl-mr', ['margin-right'], true),
	sp('fl-mb', ['margin-bottom'], true),
	sp('fl-ml', ['margin-left'], true),

	// Space between (child selector; negative)
	{ root: 'fl-space-x', emit: space('x'), negative: true },
	{ root: 'fl-space-y', emit: space('y'), negative: true },

	// Scroll margin (negative) / scroll padding
	sp('fl-scroll-m', ['scroll-margin'], true),
	sp('fl-scroll-mx', ['scroll-margin-inline'], true),
	sp('fl-scroll-my', ['scroll-margin-block'], true),
	sp('fl-scroll-ms', ['scroll-margin-inline-start'], true),
	sp('fl-scroll-me', ['scroll-margin-inline-end'], true),
	sp('fl-scroll-mt', ['scroll-margin-top'], true),
	sp('fl-scroll-mr', ['scroll-margin-right'], true),
	sp('fl-scroll-mb', ['scroll-margin-bottom'], true),
	sp('fl-scroll-ml', ['scroll-margin-left'], true),
	sp('fl-scroll-p', ['scroll-padding']),
	sp('fl-scroll-px', ['scroll-padding-inline']),
	sp('fl-scroll-py', ['scroll-padding-block']),
	sp('fl-scroll-ps', ['scroll-padding-inline-start']),
	sp('fl-scroll-pe', ['scroll-padding-inline-end']),
	sp('fl-scroll-pt', ['scroll-padding-top']),
	sp('fl-scroll-pr', ['scroll-padding-right']),
	sp('fl-scroll-pb', ['scroll-padding-bottom']),
	sp('fl-scroll-pl', ['scroll-padding-left']),

	// Inset family (negative)
	sp('fl-inset', ['inset'], true),
	sp('fl-inset-x', ['inset-inline'], true),
	sp('fl-inset-y', ['inset-block'], true),
	sp('fl-top', ['top'], true),
	sp('fl-right', ['right'], true),
	sp('fl-bottom', ['bottom'], true),
	sp('fl-left', ['left'], true),
	sp('fl-start', ['inset-inline-start'], true),
	sp('fl-end', ['inset-inline-end'], true),

	// Gap
	sp('fl-gap', ['gap']),
	sp('fl-gap-x', ['column-gap']),
	sp('fl-gap-y', ['row-gap']),

	// Translate (transform var; negative)
	{ root: 'fl-translate-x', emit: translate('x'), negative: true },
	{ root: 'fl-translate-y', emit: translate('y'), negative: true },

	// Sizing
	sp('fl-w', ['width']),
	sp('fl-h', ['height']),
	sp('fl-size', ['width', 'height']),
	sp('fl-min-w', ['min-width']),
	sp('fl-min-h', ['min-height']),
	sp('fl-max-w', ['max-width']),
	sp('fl-max-h', ['max-height']),
	sp('fl-basis', ['flex-basis']),

	// Type
	{ root: 'fl-text', kind: 'font-size' },
	{ root: 'fl-leading', scale: 'lineHeight', properties: ['line-height'] },
	{ root: 'fl-tracking', scale: 'letterSpacing', properties: ['letter-spacing'] },
	sp('fl-indent', ['text-indent'], true),

	// Decoration — radius
	{ root: 'fl-rounded', scale: 'radius', properties: ['border-radius'] },
	{
		root: 'fl-rounded-t',
		scale: 'radius',
		properties: ['border-top-left-radius', 'border-top-right-radius'],
	},
	{
		root: 'fl-rounded-r',
		scale: 'radius',
		properties: ['border-top-right-radius', 'border-bottom-right-radius'],
	},
	{
		root: 'fl-rounded-b',
		scale: 'radius',
		properties: ['border-bottom-right-radius', 'border-bottom-left-radius'],
	},
	{
		root: 'fl-rounded-l',
		scale: 'radius',
		properties: ['border-top-left-radius', 'border-bottom-left-radius'],
	},
	{
		root: 'fl-rounded-s',
		scale: 'radius',
		properties: ['border-start-start-radius', 'border-end-start-radius'],
	},
	{
		root: 'fl-rounded-e',
		scale: 'radius',
		properties: ['border-start-end-radius', 'border-end-end-radius'],
	},
	{ root: 'fl-rounded-ss', scale: 'radius', properties: ['border-start-start-radius'] },
	{ root: 'fl-rounded-se', scale: 'radius', properties: ['border-start-end-radius'] },
	{ root: 'fl-rounded-ee', scale: 'radius', properties: ['border-end-end-radius'] },
	{ root: 'fl-rounded-es', scale: 'radius', properties: ['border-end-start-radius'] },
	{ root: 'fl-rounded-tl', scale: 'radius', properties: ['border-top-left-radius'] },
	{ root: 'fl-rounded-tr', scale: 'radius', properties: ['border-top-right-radius'] },
	{ root: 'fl-rounded-br', scale: 'radius', properties: ['border-bottom-right-radius'] },
	{ root: 'fl-rounded-bl', scale: 'radius', properties: ['border-bottom-left-radius'] },

	// Decoration — border widths (each also emits its matching border-style var)
	borderSide('fl-border', 'border-style', 'border-width'),
	borderSide('fl-border-x', 'border-inline-style', 'border-inline-width'),
	borderSide('fl-border-y', 'border-block-style', 'border-block-width'),
	borderSide('fl-border-s', 'border-inline-start-style', 'border-inline-start-width'),
	borderSide('fl-border-e', 'border-inline-end-style', 'border-inline-end-width'),
	borderSide('fl-border-t', 'border-top-style', 'border-top-width'),
	borderSide('fl-border-r', 'border-right-style', 'border-right-width'),
	borderSide('fl-border-b', 'border-bottom-style', 'border-bottom-width'),
	borderSide('fl-border-l', 'border-left-style', 'border-left-width'),

	// Decoration — outline / ring / stroke (outline also emits outline-style)
	{
		root: 'fl-outline',
		scale: 'outlineWidth',
		emit: styledWidth('outline-style', '--tw-outline-style', 'outline-width'),
	},
	sp('fl-outline-offset', ['outline-offset'], true),
	{ root: 'fl-ring', scale: 'ringWidth', emit: ring },
	{ root: 'fl-stroke', scale: 'strokeWidth', properties: ['stroke-width'] },
];
