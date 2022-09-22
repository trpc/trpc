import './___packages';
import { initTRPC } from '../src/core';

const t = initTRPC.create();

test('`then` is a reserved word', async () => {
  expect(() => {
    return t.router({
      then: t.procedure.query(() => 'hello'),
    });
  }).toThrowErrorMatchingInlineSnapshot(
    `"Reserved words used in \`router({})\` call: then"`,
  );
});
