import { zrpc } from '.';
import * as z from 'zod';

const testFunc = zrpc
  .endpoint()
  .args(z.string())
  .returns(z.boolean())
  .implement((_asdf) => {
    return _asdf.length < 1234;
    // return 'asdfasdfasdf' as any;
  });

const asdf = testFunc.call('asdf');
console.log(asdf);
