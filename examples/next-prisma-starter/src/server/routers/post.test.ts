/**
 * Integration test example for the `post` router
 */
import { inferProcedureInput } from '@trpc/server';
import { createContextInner } from '../context';
import { AppRouter, createCaller } from './_app';

test('add and get post', async () => {
  const ctx = await createContextInner({});
  const caller = createCaller(ctx);

  const input: inferProcedureInput<AppRouter['post']['add']> = {
    text: 'hello test',
    title: 'hello test',
  };

  const post = await caller.post.add(input);
  const byId = await caller.post.byId({ id: post.id });

  expect(byId).toMatchObject(input);
});
