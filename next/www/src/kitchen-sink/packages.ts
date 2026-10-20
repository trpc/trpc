import type { Packages } from './modules.ts';

// The components a demo's UI is likely to need, not every one: some pull in
// charts, carousels and date pickers.
const components = import.meta.glob<object>(
  '../../../shared/ui/src/components/{alert,badge,button,card,checkbox,field,input,label,native-select,separator,skeleton,spinner,switch,textarea}.tsx',
);

/**
 * What a demo's code can import, by specifier. Each loads the site's own
 * copy on first use, so a demo's React is the page's React.
 */
export const packages: Packages = {
  '@hookform/resolvers/standard-schema': () =>
    import('@hookform/resolvers/standard-schema'),
  '@tanstack/react-query': () => import('@tanstack/react-query'),
  '@tanstack/react-router': () => import('@tanstack/react-router'),
  '@trpc12/tanstack-react-query': () => import('@trpc12/tanstack-react-query'),
  '@trpc12/trpc/client': () => import('@trpc12/trpc/client'),
  '@trpc12/trpc/serializer': () => import('@trpc12/trpc/serializer'),
  '@trpc12/trpc/server': () => import('@trpc12/trpc/server'),
  effect: () => import('effect'),
  'lucide-react': () => import('lucide-react'),
  react: () => import('react'),
  'react-hook-form': () => import('react-hook-form'),
  'react/jsx-runtime': () => import('react/jsx-runtime'),
  zod: () => import('zod'),
  ...Object.fromEntries(
    Object.entries(components).map(([path, load]) => [
      `@shared/ui/components/${path.slice(path.lastIndexOf('/') + 1, -'.tsx'.length)}`,
      load,
    ]),
  ),
};
