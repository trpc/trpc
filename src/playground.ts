import { zodrpc } from '.';
import * as z from 'zod';
// import { rpc } from './external';

const testFunc = zodrpc
  .endpoint()
  .args(z.string())
  .returns(z.boolean())
  .implement((asdf) => {
    return asdf.length < 1234;
  });

const asdf = testFunc.call('asdf');
console.log(asdf);
