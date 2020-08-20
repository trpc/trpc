import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import compression from 'compression';
// import axios from 'axios';

// import httpContext from 'express-http-context';

import { trpc } from '.';

export const computeLength = trpc
  .endpoint(() => (str: string) => {
    return str.length;
  })
  .authorize(() => (_id) => {
    return true; //id.length < 12;
  });

export const testEndpoint = trpc
  .endpoint((_ctx) => (id: string) => {
    return id.length;
  })
  .authorize(() => (_id) => {
    return true; //id.length < 12;
  });

export const createPost = trpc
  .endpoint((ctx: { token: string }) => async (content: string) => {
    await new Promise((res) => {
      setTimeout(res, 3000);
    });
    return {
      content,
      token: ctx.token,
    };
  })
  .authorize(() => () => {
    return true; //id.length < 12;
  });

const userRouter = trpc
  .router()
  .endpoint('testEndpoint', testEndpoint)
  .endpoint('createPost', createPost);
export const rootRouter = trpc
  .router()
  .compose('user', userRouter)

  .endpoint(
    'getContext',
    trpc.endpoint((ctx) => () => ctx).authorize(() => () => true),
  );
// const api = trpc.api(rootRouter);

export const checkLocal = (host: string): boolean => {
  return host.includes('localhost') || host.includes('127.0.0.1');
};

export const app = express();

app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    limit: '50mb',
    extended: true,
    parameterLimit: 50000,
  }),
);
app.post('/rpc', rootRouter.toExpress());

app.listen(5000, async () => {
  console.log(`listening on port 5000...`);
  const mySDK = trpc.sdk<typeof rootRouter>({
    url: 'http://localhost:5000/rpc',
    getContext: async () => {
      return { token: 'hello there' };
    },
    // handler: async (url, payload) => {
    //   const result = await axios.post(url, payload);
    //   return result.data;
    // },
  });

  console.log(
    rootRouter.toServerSDK().user.testEndpoint({}, 'this is a test string'),
  );
  console.log(await mySDK.user.testEndpoint('thisisanid'));
  console.log(await mySDK.getContext());
  console.log(await mySDK.user.createPost('This is my post!'));
});
