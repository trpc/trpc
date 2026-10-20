/**
 * What a demo's code can import, by specifier: the keys of `packages.ts`,
 * whose loaders have to name each one literally. Pure, so the build reads
 * it too: it bundles their declarations for the editor's type checker.
 */
export const packageNames = [
  '@hookform/resolvers/standard-schema',
  '@tanstack/react-query',
  '@tanstack/react-router',
  '@trpc12/tanstack-react-query',
  '@trpc12/trpc/client',
  '@trpc12/trpc/server',
  'effect',
  'lucide-react',
  'react',
  'react-hook-form',
  'react/jsx-runtime',
  'zod',
  ...[
    'alert',
    'badge',
    'button',
    'card',
    'checkbox',
    'field',
    'input',
    'label',
    'native-select',
    'separator',
    'skeleton',
    'spinner',
    'switch',
    'textarea',
  ].map((name) => `@shared/ui/components/${name}`),
];
