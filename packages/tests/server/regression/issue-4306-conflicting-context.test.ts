import { initTRPC } from '@trpc/server';

test('conflicting context', () => {
  const a = initTRPC.context<{ a: string }>().create();
  const b = initTRPC.context<{ b: string }>().create();

  a.router({
    a: a.procedure.query(({ ctx }) => ctx.a.slice()),
    // @ts-expect-error these contexts do not match
    b: b.procedure.query(({ ctx }) => ctx.b.slice()),
  });
});
