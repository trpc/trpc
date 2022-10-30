import './___packages';
import { initTRPC } from '@trpc/server/src/core';

const t = initTRPC.create<{}>();

describe('`then`', () => {
  test('is a reserved word', async () => {
    expect(() => {
      return t.router({
        then: t.procedure.query(() => 'hello'),
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `"Reserved words used in \`router({})\` call: then"`,
    );
  });

  // Regression https://github.com/trpc/trpc/pull/2562
  test('because it creates async fns that returns proxy objects', async () => {
    const appRouter = t.router({});
    const asyncFnThatReturnsCaller = async () => appRouter.createCaller({});

    await asyncFnThatReturnsCaller();
  });
});
