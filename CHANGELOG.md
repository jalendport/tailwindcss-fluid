# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Fluid `clamp()` utilities (`fl-`) for every length-accepting core root — spacing (padding, margin, gap, inset, space-between, scroll-margin/padding, translate), sizing (`w`/`h`/`size`/`min-*`/`max-*`/`basis`), type (`fl-text` with interpolated font-size, line-height and letter-spacing sub-values, plus `fl-leading`/`fl-tracking`/`fl-indent`), and decoration (`fl-rounded`, border widths, `fl-outline`, `fl-outline-offset`, `fl-ring`, `fl-stroke`). Negatives (`-fl-mt-3/5`) register wherever the core utility supports them.
- Slash-pair grammar riding Tailwind's native value/modifier channels: theme keys (`fl-text-base/4xl`), arbitrary lengths (`fl-p-[1rem]/[2rem]`), and decreasing ranges (`fl-p-8/4`).
- Viewport range variants — `fl-md/lg:`, `fl-md:`, `fl/lg:`, and arbitrary/mixed forms (`fl-[24rem]/[80rem]:`, `fl-md/[80rem]:`) — that retune the fluid range per element.
- Container-query range variants (`@fl-md/lg:`, `@fl-md:`, `@fl/lg:`, `@fl-[24rem]/[72rem]:`) that interpolate on container width, defaulting to the container-token range.
- Runtime CSS-variable clamp engine (`@property`-registered `--fl-bp-min`/`--fl-bp-max`/`--fl-vw` with `inherits: false`), the only architecture that lets range variants work under Tailwind v4.
- Rem-only unit policy: interpolation endpoints must be rem-resolvable (rem native, px folded at 16px/rem); other units surface an `unsupported-unit` error.
- WCAG 1.4.4 (Resize Text) zoom-safety check that rejects fluid font-size pairs too shallow to survive 5× zoom, with a `checkSC144: false` opt-out.
- Fluid theme tokens in the `--fl-*` namespace (`--fl-display: 2rem 4rem;` → `fl-text-display`).
- `min-screen` / `max-screen` `@plugin` options to override the default viewport range.
- Visible error surfacing via a `--tw-fl-error` custom property (shown in devtools and on IntelliSense hover) for invalid class forms, keeping the language server crash-free.
- IntelliSense support: autocompletion for `fl-*` utilities and `fl-`/`@fl-` variant prefixes, plus compiled-CSS hover previews.
- `@jalendport/tailwindcss-fluid/tailwind-merge` subpath export — a `withFluid` extension for tailwind-merge v3 (optional peer) that merges fluid utilities with their non-fluid counterparts.
