# @jalendport/tailwindcss-fluid

Fluid `clamp()` utilities and range variants for Tailwind CSS v4.

```sh
pnpm add -D @jalendport/tailwindcss-fluid
```

```css
@import 'tailwindcss';
@plugin "@jalendport/tailwindcss-fluid";
```

```html
<h1 class="fl-text-base/4xl">Fluidly scaled type</h1>
<div class="fl-md/lg:fl-p-4/8">Interpolates across the md→lg range</div>
```

A [tailwind-merge](https://github.com/dcastil/tailwind-merge) v3 companion ships as the `@jalendport/tailwindcss-fluid/tailwind-merge` subpath export (`withFluid`), with `tailwind-merge` as an optional peer:

```ts
import { extendTailwindMerge } from 'tailwind-merge';
import { withFluid } from '@jalendport/tailwindcss-fluid/tailwind-merge';

const twMerge = extendTailwindMerge(withFluid);
```

See the [full documentation and class-grammar reference](https://github.com/jalendport/tailwindcss-fluid#readme) in the repository root.

MIT © Jalen Davenport
