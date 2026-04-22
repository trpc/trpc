/**
 * Integration test example for the `post` router
 */
import type { inferProcedureInput } from '@trpc/server';
import { createContextInner } from '../context';
import type { AppRouter } from './_app';
import { createCaller } from './_app';

test('add and get post', async () => {
  const ctx = await createContextInner({});
  const caller = createCaller(ctx);

  const input: inferProcedureInput<AppRouter['post']['add']> = {
    select: ['id', 'text', 'title'],
    text: 'hello test',
    title: 'hello test',
  };

  const post = await caller.post.add(input);
  const postId = post.id as string;
  const [byId] = await caller.post.byId({
    ids: [postId],
    select: ['id', 'text', 'title'],
  });

  expect(byId).toMatchObject(input);
});
