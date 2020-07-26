import { zrpc } from '.';
import * as z from 'zod';

// const sdkparams = {
//   url: 'http:localhost',
//   handler: (..._x: any) => {
//     return 'asdf' as any;
//   },
// };

const User = z.object({
  id: z.string().uuid(),
  name: z.string(),
  points: z.number(),
});

const getUserById = zrpc
  .endpoint()
  .args(z.string().uuid())
  .returns(z.promise(User))
  .implement(async (_id) => {
    // const user = await getUserById(id);
    // return user;
    return 'asdf' as any;
  });

const userRouter = zrpc.router().endpoint('getById', getUserById);

const rootRouter = zrpc.router().compose('user', userRouter);

export const myApi = zrpc.api(rootRouter);
// myApi.router.
// // const sdk = myApi.to.sdk(sdkparams);

// const run = async () => {
//   const res = await Promise.resolve(sdk.innerRouter.innerEndpoint('asdfasdf'));
//   console.log(res);
// };

// run();
