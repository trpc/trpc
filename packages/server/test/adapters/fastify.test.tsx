import f from 'fastify';
import * as trpc from '../../../server/src';
async function startServer() {
  const fastify = f();

  // Declare a route
  fastify.get('/', function (request, reply) {
    reply.send({ hello: 'world' });
  });
  const url = await fastify.listen(0);

  return {
    url,
    close: () => {
      return fastify.close();
    },
  };
}

let t: trpc.inferAsyncReturnType<typeof startServer>;
beforeAll(async () => {
  t = await startServer();
});
afterAll(async () => {
  await t.close();
});

test('start server', async () => {
  expect(t.url).toBeTruthy();
});
