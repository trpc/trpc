import { defaultHandler, MapHandler, undefinedHandler } from './handlers';
import { tsonEncoder, tsonParser, tsonStringifier } from './tson';
import { TsonOptions } from './types';

{
  const tsonOpts: TsonOptions = {
    types: {
      ...defaultHandler,
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
      ...defaultHandler,
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
  console.log('-------undefined');
  const tsonOpts: TsonOptions = {
    types: {
      ...defaultHandler,
      Map: MapHandler,
      undefined: undefinedHandler,
    },
    nonce: () => `__tson-${Math.random()}`,
  };

  const l = {
    parse: tsonParser(tsonOpts),
    stringify: tsonStringifier(tsonOpts),
  };
  const orig = {
    foo: 'bar',
    undefined: undefined,
  };
  const stringified = l.stringify(orig, 2);
  const parsed = l.parse(stringified);

  console.log('orig:', orig);
  console.log('stringified:', stringified);
  console.log('parsed back:', parsed);
}

{
  console.log('-------tson2');
  const tsonOpts: TsonOptions = {
    types: {
      ...defaultHandler,
      Map: MapHandler,
      undefined: undefinedHandler,
    },
    nonce: () => `__tson-${Math.random()}`,
  };

  const encoder = tsonEncoder(tsonOpts);
  const orig: any = {
    foo: 'bar',
    undefined: undefined,
  };
  console.log('source', orig);
  console.log('encoded', JSON.stringify(encoder(orig), null, 4));
}
