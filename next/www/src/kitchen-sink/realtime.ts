import { type DemoDefinition, filesOf } from './define.ts';

const sources = import.meta.glob<string>(
  '../../samples/kitchen-sink-realtime/src/*.{ts,tsx}',
  { eager: true, import: 'default', query: '?raw' },
);

const realtime: DemoDefinition = {
  entry: 'router.tsx',
  files: filesOf(sources, [
    'server.ts',
    'room.tsx',
    'trpc.ts',
    'routes.tsx',
    'rooms.ts',
    'router.tsx',
  ]),
  hint: 'Send a message from one browser and watch it arrive in the other. Then drop the connections, send one while they reconnect, and see it arrive once they’re back.',
  id: 'realtime',
  open: 'server.ts',
  server: 'server.ts',
  start: '/rooms/general',
  users: ['ada', 'grace'],
};

export default realtime;
