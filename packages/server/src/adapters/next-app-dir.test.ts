import { experimental_trpcMiddleware, initTRPC } from '../@trpc/server';
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

test('with path extractor', async () => {
  interface Meta {
    span: string;
  }
  const t = initTRPC.meta<Meta>().create();

  // Some external middleware that relies on procedure paths
  const loggerMiddleware = experimental_trpcMiddleware().create(
    async (opts) => {
      const start = new Date().getTime();
      const result = await opts.next();
      const duration = new Date().getTime() - start;

      // eslint-disable-next-line no-console
      console.log(`${opts.path} took ${duration}ms`);

      return result;
    },
  );

  const base = t.procedure
    .experimental_caller(
      nextAppDirCaller({
        pathExtractor: ({ meta }) => (meta as Meta).span,
      }),
    )
    .use(loggerMiddleware);

  const loggerSpy = vi.spyOn(console, 'log').mockImplementation(() => {
    // no-op
  });

  {
    const proc = base.meta({ span: 'hello' }).query(async () => 'hello');
    const result = await proc();
    expect(result).toBe('hello');

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('hello took'),
    );
  }
});
