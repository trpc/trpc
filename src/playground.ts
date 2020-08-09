// import { trpc } from '.';
// import * as z from 'zod';
// import axios from 'axios';

// const User = z.object({
//   id: z.string().uuid(),
//   name: z.string(),
//   points: z.number(),
// });

// const getUserById = trpc.endpoint({
//   implement: function () {
//     const xtx = this.context;
//     return z
//       .function()
//       .args(z.string().uuid())
//       .returns(z.promise(User))
//       .implement((_id) => {
//         return 'asdf' as any;
//       });
//   }
// });

// const userRouter = trpc.router().endpoint('getById', getUserById);
// const rootRouter = trpc.router().compose('user', userRouter);
// export const myApi = trpc.api(rootRouter);

// export const mySDK = myApi.toClientSDK({
//   url: 'http://localhost',
//   handler: async (url, payload) => {
//     return axios.post(url, {
//       data: { ...payload, context: { test: 'hello there' } },
//     });
//   },
// });

// type EndpointPayload = { name: string; implement: Function };

// const infer = <T extends EndpointPayload>(arg: T & ThisType<{ context: { [k: string]: any } }>) => arg;
// infer({
//   name: 'asdf',
//   implement() {
//     this.context.token;
//   },
// });

// // const qer: (arg: [string, number]) => any = ([a, b]) => {
// //   console.log(a);
// //   console.log(b);
// // };
