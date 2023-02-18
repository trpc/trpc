import { EventEmitter } from 'events';
import { nodeHTTPJSONContentTypeHandler } from './contentType';

test('has body', async () => {
  const body = {};
  const resolvedBody = await nodeHTTPJSONContentTypeHandler.getBody({
    req: { body },
  } as any);
  expect(resolvedBody).toMatchInlineSnapshot(`
    Object {
      "data": Object {},
      "ok": true,
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
  const result = await nodeHTTPJSONContentTypeHandler.getBody({
    req: events,
  } as any);

  expect(result.ok).toBeTruthy();
  expect((result as any).data).toBeTruthy();
  expect(result).toMatchInlineSnapshot(`
Object {
  "data": "{\\"hello\\":\\"there\\"}",
  "ok": true,
}
`);
});
