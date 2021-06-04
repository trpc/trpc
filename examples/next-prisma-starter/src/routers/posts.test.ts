import { createContext } from './utils/createRouter';
import { createTestRouter } from './utils/testUtils';
let t: ReturnType<typeof createTestRouter>;

beforeEach(() => {
  t = createTestRouter({
    createContext: createContext,
  });
});

afterEach(() => {
  t.close();
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
