import { zrpc } from '.';
import * as z from 'zod';

const sdkparams = {
  url: 'http:localhost',
  handler: (..._x: any) => {
    return 'asdf' as any;
  },
};

const testEndpoint = zrpc
  .endpoint()
  .args(z.string())
  .returns(z.boolean())
  .implement((_asdf) => {
    return _asdf.length < 1234;
    // return 'asdfasdfasdf' as any;
  });

const innerRouter = zrpc.router().endpoint('innerEndpoint', testEndpoint);
const outerRouter = zrpc
  .router()
  // .endpoint('outerEndpoint', testEndpoint)
  .compose('innerRouter', innerRouter);

const myApi = zrpc.api(outerRouter);
const sdk = myApi.to.sdk(sdkparams);

const run = async () => {
  const res = await Promise.resolve(sdk.innerRouter.innerEndpoint('asdfasdf'));
  console.log(res);
};

run();
