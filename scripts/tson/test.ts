import { defaults, MapHandler } from './handlers';
import { tsonParser, tsonStringifier } from './tson';
import { TsonOptions } from './types';

{
  const tsonOpts: TsonOptions = {
    types: {
      ...defaults,
      Map: MapHandler,
    },
    nonce: () => `__tson-${Math.random()}`,
  };
  const l = {
    parse: tsonParser(tsonOpts),
    stringify: tsonStringifier(tsonOpts),
  };
  const orig = {
    ok: '1',
    map: new Map([['foo', new Map([['bar', 'baz']])]]),
    bigint: 100n,
  };
  const stringified = l.stringify(orig, 2);
  const parsed = l.parse(stringified);
  console.log('orig:', orig);
  console.log('stringified:', stringified);
  console.log('parsed back:', parsed);

  console.log('-------primitive');
  console.log(l.parse(l.stringify('asd')));
}
{
  const tsonOpts: TsonOptions = {
    types: {
      ...defaults,
      Map: MapHandler,
    },
    nonce: () => `__tson-${Math.random()}`,
  };
  console.log('-------random nonce');
  const randomNonceStringify = tsonStringifier({
    ...tsonOpts,
  });
  const parser = tsonParser(tsonOpts);

  const orig = new Map([['foo', 'bar']]);
  const stringified = randomNonceStringify(orig);
  console.log('orig', orig);
  console.log('stringified', stringified);
  console.log('parsed back', parser(stringified));
}
{
  const tsonOpts: TsonOptions = {
    types: {
      ...defaults,
      Map: MapHandler,
      undefined: {
        primitive:
      }
    },
    nonce: () => `__tson-${Math.random()}`,
  };
}
