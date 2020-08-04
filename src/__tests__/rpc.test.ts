import * as z from 'zod';
import { trpc } from '..';

export const makeApi = () => {
  const rootRouter = trpc.router().endpoint(
    'getUserById',
    trpc
      .endpoint(
        z
          .function()
          .args(z.object({ id: z.string() }), z.object({ userId: z.string() }))
          .returns(z.boolean())
          .implement((...args) => {
            const [arg, params] = args;
            return arg.id === params.userId;
          }),
      )
      .authorize((args) => {
        const [arg, params] = args;
        return Promise.resolve(arg.id === params.userId);
      }),
  );

  return trpc.api(rootRouter);
};

test('rpc basics', () => {
  const myApi = makeApi();
  myApi.router.handle({ endpoint: ['getUserById'], args: [{ id: 'asdf' }, false] });
});
