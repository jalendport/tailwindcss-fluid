# @tailwindcss-fluid/tailwind-merge

A [tailwind-merge](https://github.com/dcastil/tailwind-merge) v3 companion for [tailwindcss-fluid](https://github.com/jalendport/tailwindcss-fluid). The `withFluid` config extension teaches tailwind-merge to resolve conflicts between fluid utilities (`fl-p-4/8`) and their non-fluid counterparts (`p-4`), last-one-wins.

```ts
import { extendTailwindMerge } from 'tailwind-merge';
import { withFluid } from '@tailwindcss-fluid/tailwind-merge';

const twMerge = extendTailwindMerge(withFluid);
twMerge('p-4 fl-p-2/6'); // → 'fl-p-2/6'
```

See the [full documentation](https://github.com/jalendport/tailwindcss-fluid#tailwind-merge-companion) in the repository root.

MIT © Jalen Davenport
