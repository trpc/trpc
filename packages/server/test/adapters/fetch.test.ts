// /**
//  * @jest-environment miniflare
//  */
// import esbuild from 'esbuild';
// import { Miniflare } from 'miniflare';
// import fetch from 'node-fetch';
// import { join } from 'path';
// import { createTRPCClient } from '../../../../client/src';
// import * as trpc from '../../../src';
// import { router } from './worker';

// async function startServer() {
//   const port = 8787;

//   const result = await esbuild.build({
//     bundle: true,
//     entryPoints: [join(__dirname, 'worker.ts')],
//     format: 'iife',
//     write: false,
//   });

//   const mf = new Miniflare({
//     script: result,
//     port,
//   });
//   const server = await mf.startServer();

//   const client = createTRPCClient<typeof router>({
//     url: `http://localhost:${port}`,

//     AbortController: AbortController as any,
//     fetch: fetch as any,
//   });

//   return {
//     close: () =>
//       new Promise<void>((resolve, reject) =>
//         server.close((err) => {
//           err ? reject(err) : resolve();
//         }),
//       ),
//     port,
//     router,
//     client,
//   };
// }

// let t: trpc.inferAsyncReturnType<typeof startServer>;
// beforeAll(async () => {
//   t = await startServer();
// });
// afterAll(async () => {
//   await t.close();
// });

// test('simple query', async () => {
//   expect(
//     await t.client.query('hello', {
//       who: 'test',
//     }),
//   ).toMatchInlineSnapshot(`
//      Object {
//        "text": "hello test",
//      }
//    `);

//   expect(await t.client.query('hello')).toMatchInlineSnapshot(`
//      Object {
//        "text": "hello world",
//      }
//    `);
// });
