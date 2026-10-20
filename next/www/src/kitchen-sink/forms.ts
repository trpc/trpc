import { type DemoDefinition, filesOf } from './define.ts';

const sources = import.meta.glob<string>(
  '../../samples/kitchen-sink-forms/src/*.{ts,tsx}',
  { eager: true, import: 'default', query: '?raw' },
);

const forms: DemoDefinition = {
  entry: 'router.tsx',
  files: filesOf(sources, [
    'edit-profile.tsx',
    'schema.ts',
    'server.ts',
    'routes.tsx',
    'loader-query.ts',
    'trpc.ts',
    'router.tsx',
  ]),
  hint: 'Save with a short username, or admin, or with the browser check off; then edit the code and watch the app restart.',
  id: 'forms',
  open: 'edit-profile.tsx',
  server: 'server.ts',
  start: '/edit',
};

export default forms;
