import * as z from 'zod';
import { zrpc } from '..';
// import { zrpcApi, zrpcEndpoint } from "../internal";

export const makeApi = () => {
  // const myApi = zrpc.api({
  // uri: 'http://localhost:3000/rpc',
  // getContext: async (_params) => {
  //   return { userId: 'asdf' };
  // },
  // });

  // myApi.root.endpoint(
  //     'getUserById',
  //     zrpc.endpoint().args(z.string()).returns(z.boolean()).wrap((args)=> args.length > 15));
  const rootRouter = zrpc.router().endpoint(
    'getUserById',
    zrpc
      .endpoint()
      .args(z.object({ id: z.string() }), z.object({ userId: z.string() }))
      .returns(z.boolean())
      .implement((...args) => {
        const [arg, params] = args;
        return arg.id === params.userId;
      })
      .authorize((args) => {
        const [arg, params] = args;
        return Promise.resolve(arg.id === params.userId);
      }),
  );

  return zrpc.api(rootRouter);
};

test('rpc basics', () => {
  const myApi = makeApi();
  myApi.router.handle({ endpoint: ['getUserById'], args: [{ id: 'asdf' }, false] });
});
