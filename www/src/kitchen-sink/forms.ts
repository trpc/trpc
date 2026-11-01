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
  hint: 'Save admin as the username, with the browser check on and then off; then rename the name field in schema.ts and watch the files that use it turn red.',
  id: 'forms',
  open: 'edit-profile.tsx',
  server: 'server.ts',
  start: '/edit',
};

export default forms;
