import { type DemoDefinition, filesOf } from './define.ts';

const sources = import.meta.glob<string>(
  '../../samples/kitchen-sink-files/src/*.{ts,tsx}',
  { eager: true, import: 'default', query: '?raw' },
);

const files: DemoDefinition = {
  entry: 'router.tsx',
  files: filesOf(sources, [
    'server.ts',
    'profile.tsx',
    'images.ts',
    'transformer.ts',
    'trpc.ts',
    'router.tsx',
  ]),
  hint: 'Draw an avatar and save it, then open the requests: the upload is multipart, and the avatar comes back as the response body. Try one that’s too big, or not an image.',
  id: 'files',
  open: 'server.ts',
  server: 'server.ts',
  start: '/',
};

export default files;
