/**
 * Integration test example for the `post` router
 */
import { appRouter } from './_app';
import { inferMutationInput } from '~/utils/trpc';

test('add and get post', async () => {
  const caller = appRouter.createCaller({});

  const input: inferMutationInput<'post.add'> = {
    text: 'hello test',
    title: 'hello test',
  };
  const post = await caller.mutation('post.add', input);
  const byId = await caller.query('post.byId', {
    id: post.id,
  });

  expect(byId).toMatchObject(input);
});
