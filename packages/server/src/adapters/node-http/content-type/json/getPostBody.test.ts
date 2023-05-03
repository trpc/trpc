import { EventEmitter } from 'events';
import { getPostBody } from './getPostBody';

test('has body', async () => {
  const body = {};
  const resolvedBody = await getPostBody({
    req: {
      body,
      headers: {
        'content-type': 'application/json',
      },
    },
  } as any);
  expect(resolvedBody).toMatchInlineSnapshot(`
    Object {
      "data": Object {},
      "ok": true,
      "preprocessed": true,
    }
  `);
});

test('req as eventemitter', async () => {
  const events = new EventEmitter();
  setTimeout(() => {
    events.emit(
      'data',
      JSON.stringify({
        hello: 'there',
      }),
    );
    events.emit('end');
  }, 5);

  (events as any).headers = {};
  const result = await getPostBody({
    req: events,
  } as any);

  expect(result.ok).toBeTruthy();
  expect((result as any).data).toBeTruthy();
  expect(result).toMatchInlineSnapshot(`
    Object {
      "data": "{\\"hello\\":\\"there\\"}",
      "ok": true,
      "preprocessed": false,
    }
  `);
});
