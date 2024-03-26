import { initTRPC } from '../@trpc/server';
import { experimental_nextAppDirCaller } from './next-app-dir';

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
      experimental_nextAppDirCaller({
        normalizeFormData: true,
      }),
    );

  {
    // no input
    const proc = base.query(async () => 'hello');
    const result = await proc();
    expect(result).toBe('hello');

    expect(proc._def.type).toBe('query');
  }
});

test('with context', async () => {
  const t = initTRPC
    .context<{
      foo: string;
    }>()
    .create();

  t.procedure.experimental_caller(
    experimental_nextAppDirCaller({
      createContext: () => ({ foo: 'bar' }),
    }),
  );

  t.procedure.experimental_caller(
    experimental_nextAppDirCaller(
      // @ts-expect-error no error
      {},
    ),
  );
});
