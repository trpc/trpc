import * as z from 'zod';
import { zodrpc } from '..';
import { Post } from '../userpost';

test('router creation', () => {
  const api = zodrpc.api({
    uri: 'http://localhost:5000/rpc',
    // getContext: async (_params) => {
    //   return { userId: 'qweqewr' };
    // },
  });

  // type Meta = typeof api['META'];

  const getUserById = zodrpc
    .endpoint()
    .args(z.object({ id: z.string() }), z.object({ userId: z.string() }))
    .returns(z.promise(z.boolean()))
    .implement(async (arg, params) => {
      return arg.id === params.userId;
    })
    .authorize((args) => {
      return Promise.resolve(args[0].id.length === 4);
    });

  type getUserById = typeof getUserById;

  const userRouter = zodrpc.router();
  userRouter.endpoint('getById', getUserById);
  userRouter.endpoint(
    'modGetById',
    zodrpc
      .endpoint()
      .args(z.object({ id: z.string() }), z.object({ userId: z.string() }))
      .returns(z.promise(z.boolean()))
      .implement(async (arg, params) => {
        return arg.id === params.userId;
      })
      .authorize((args) => {
        return Promise.resolve(args[0].id.length === 4);
      }),
  );

  // const qwer = zodrpc
  //   .newendpoint([PostStruct.omit({ timestamp: true })], z.promise(PostStruct.omit({ timestamp: true })))
  //   .implement(async (post) => {
  //     return post;
  //   });
  userRouter.endpoint(
    'newEndpoint',
    zodrpc
      .endpoint()
      .args(Post.omit({ content: true }))
      .returns(z.promise(Post.omit({ content: true })))
      .implement(async (post) => {
        return post;
      }),
  );

  console.log('creating userApi');
  api.root.compose('user', userRouter);

  api.to.express();
  api.to.sdk();
});
