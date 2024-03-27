import { initTRPC } from '../@trpc/server';
import { nextAppDirCaller } from './next-app-dir/nextAppDirCaller';

test('experimental caller', async () => {
  const t = initTRPC.create();

  const base = t.procedure
    .use((opts) => {
      return opts.next({
        ctx: {
          foo: 'bar' as const,
        },
      });
    })
    .experimental_caller(
      nextAppDirCaller({
        normalizeFormData: true,
      }),
    );

  {
    // no input
    const proc = base.query(async () => 'hello');
    const result = await proc();
    expect(result).toBe('hello');

    expect((proc as any)._def.type).toBe('query');
  }
});

test('with context', async () => {
  const t = initTRPC
    .context<{
      foo: string;
    }>()
    .create();

  t.procedure.experimental_caller(
    nextAppDirCaller({
      createContext: () => ({ foo: 'bar' }),
    }),
  );

  t.procedure.experimental_caller(
    nextAppDirCaller(
      // @ts-expect-error no error
      {},
    ),
  );
});
