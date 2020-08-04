import * as z from 'zod';
import { trpc } from '..';

test('router creation', () => {
  // const api = trpc.api({
  // uri: 'http://localhost:5000/rpc',
  // getContext: async (_params) => {
  //   return { userId: 'qweqewr' };
  // },
  // });

  // type Meta = typeof api['META'];

  const getUserById = trpc
    .endpoint(
      z
        .function()
        .args(z.object({ id: z.string() }), z.object({ userId: z.string() }))
        .returns(z.promise(z.boolean()))
        .implement(async (arg, params) => {
          return arg.id === params.userId;
        }),
    )

    .authorize((args) => {
      return Promise.resolve(args[0].id.length === 4);
    });

  type getUserById = typeof getUserById;

  const userRouter = trpc.router();
  userRouter.endpoint('getById', getUserById);
  userRouter.endpoint(
    'modGetById',
    trpc
      .endpoint(
        z
          .function()
          .args(z.object({ id: z.string() }), z.object({ userId: z.string() }))
          .returns(z.promise(z.boolean()))
          .implement(async (arg, params) => {
            return arg.id === params.userId;
          }),
      )
      .authorize((args) => {
        return Promise.resolve(args[0].id.length === 4);
      }),
  );

  const api = trpc.api(userRouter);

  console.log('creating userApi');
  api.router.compose('user', userRouter);

  api.to.express();
  api.to.sdkFile();
});
