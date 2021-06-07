import { getPostBody } from './getPostBody';
import { EventEmitter } from 'events';
test('has body', async () => {
  const body = {};
  const resolvedBody = await getPostBody({ req: { body } } as any);
  expect(body).toBe(resolvedBody);
});

test('body cannot be parsed', async () => {
  const events = new EventEmitter();
  setTimeout(() => {
    events.emit('data', {});
    events.emit('data', {});
    events.emit('end');
  }, 1);
  await expect(
    getPostBody({ req: events } as any),
  ).rejects.toMatchInlineSnapshot(
    `[TRPCError: Body couldn't be parsed as json]`,
  );
});
