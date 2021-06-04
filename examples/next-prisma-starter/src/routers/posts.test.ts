import { inferAsyncReturnType } from '@trpc/server';
import { createContext } from './utils/createRouter';
import { createTestRouter } from './utils/testUtils';
let t: inferAsyncReturnType<typeof createTestRouter>;

beforeAll(async () => {
  t = await createTestRouter({
    createContext: createContext,
  });
});

afterAll(() => {
  return t.close();
});

test('create and get post', async () => {
  const client = t.client();

  const nonce = `${Math.random()}`;
  const { id } = await client.mutation('posts.add', {
    title: nonce,
    text: nonce,
  });
  const post = await client.query('posts.byId', id);
  expect(post).toMatchObject({
    id,
    title: nonce,
    text: nonce,
  });
});
