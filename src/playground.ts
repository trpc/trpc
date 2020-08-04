import { trpc } from '.';
import * as z from 'zod';

const User = z.object({
  id: z.string().uuid(),
  name: z.string(),
  points: z.number(),
});

const getUserById = trpc.endpoint(
  z
    .function()
    .args(z.string().uuid())
    .returns(z.promise(User))
    .implement(async (_id) => {
      return 'asdf' as any;
    }),
);

const userRouter = trpc.router().endpoint('getById', getUserById);
const rootRouter = trpc.router().compose('user', userRouter);
export const myApi = trpc.api(rootRouter);
