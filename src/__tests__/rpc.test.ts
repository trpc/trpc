import * as z from 'zod';
import { zodrpc } from '..';
// import { ZodRPCApi, ZodRPCEndpoint } from "../internal";

export const makeApi = () => {
  const myApi = zodrpc.api({
    uri: 'http://localhost:3000/rpc',
    // getContext: async (_params) => {
    //   return { userId: 'asdf' };
    // },
  });

  // myApi.root.endpoint(
  //     'getUserById',
  //     zodrpc.endpoint().args(z.string()).returns(z.boolean()).wrap((args)=> args.length > 15));

  myApi.root.endpoint(
    'getUserById',
    zodrpc
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

  return myApi;
};

test('rpc basics', () => {
  const myApi = makeApi();
  myApi.root.handle({ endpoint: ['getUserById'], args: [{ id: 'asdf' }, false] });
});
