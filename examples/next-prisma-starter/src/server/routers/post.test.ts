/**
 * Integration test example for the `post` router
 */
import { createContextInner } from '../context';
import { appRouter } from './_app';
import { inferMutationInput } from '~/utils/trpc';

test('add and get post', async () => {
  const ctx = await createContextInner({});
  const caller = appRouter.createCaller(ctx);

  const input: inferMutationInput<'postAdd'> = {
    text: 'hello test',
    title: 'hello test',
  };
  const post = await caller.mutation('postAdd', input);
  const byId = await caller.query('postById', {
    id: post.id,
  });

  expect(byId).toMatchObject(input);
});
