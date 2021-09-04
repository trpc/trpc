import { getPostBody } from './getPostBody';
import { EventEmitter } from 'events';
test('has body', async () => {
  const body = {};
  const resolvedBody = await getPostBody({ req: { body } } as any);
  expect(body).toBe(resolvedBody);
});
