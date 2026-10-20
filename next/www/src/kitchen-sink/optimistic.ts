import { type DemoDefinition, filesOf } from './define.ts';

const sources = import.meta.glob<string>(
  '../../samples/kitchen-sink-optimistic/src/*.{ts,tsx}',
  { eager: true, import: 'default', query: '?raw' },
);

const optimistic: DemoDefinition = {
  entry: 'router.tsx',
  files: filesOf(sources, [
    'optimistic.ts',
    'todos.tsx',
    'server.ts',
    'trpc.ts',
    'router.tsx',
  ]),
  hint: 'Set the network to Slow and add a todo: it shows at once. Then press Fail next request and add another, or add one over 30 characters, and watch it get taken back.',
  id: 'optimistic',
  open: 'optimistic.ts',
  server: 'server.ts',
  start: '/',
};

export default optimistic;
