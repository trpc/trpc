import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import compression from 'compression';
import axios from 'axios';

// import httpContext from 'express-http-context';

import { trpc } from '.';

export const testEndpoint = trpc
  .endpoint((_ctx, id: string) => {
    console.log(JSON.stringify(_ctx, null, 2));
    return id.length;
  })
  .authorize((id) => {
    return id.length < 12;
  });

const userRouter = trpc.router().endpoint('testEndpoint', testEndpoint);
const rootRouter = trpc.router().compose('user', userRouter);
const api = trpc.api(rootRouter);

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
app.post('/rpc', api.toExpress());

app.listen(5000, async () => {
  console.log(`listening on port 5000...`);
  const mySDK = api.toClientSDK({
    url: 'http://localhost:5000/rpc',
    handler: async (url, payload) => {
      const result = await axios.post(url, {
        endpoint: payload.endpoint,
        args: [{ test: 'hello there' }, ...payload.args],
      });
      return result.data;
    },
  });
  const result = await mySDK.user.testEndpoint('thisisanid');
  console.log(result);
});
