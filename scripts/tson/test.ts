import { tsonParser, tsonStringifier } from './tson';
import { TsonOptions, TsonTypeHandler } from './types';

type UnknownMap = Map<unknown, unknown>;
const MapHandler: TsonTypeHandler<UnknownMap> = {
  test(v) {
    return v instanceof Map;
  },
  encode(v) {
    return Array.from(v.entries());
  },
  decode(v) {
    return new Map(v as any[]);
  },
};

const bigintHandler: TsonTypeHandler<bigint> = {
  primitive: 'bigint',
  decode(v) {
    return BigInt(v as string);
  },
  encode(v) {
    return v.toString();
  },
};

const numberHandler: TsonTypeHandler<number> = {
  primitive: 'number',
  transform: false,
  test(v) {
    if (isNaN(v as number)) {
      throw new Error('NaN is not supported');
    }
    return true;
  },
};

const defaults = {
  Map: MapHandler,
  bigint: bigintHandler,
  numberHandler,
} satisfies TsonOptions['types'];

const tsonOpts: TsonOptions = {
  types: {
    ...defaults,
    Map: MapHandler,
  },
  nonce: () => `__tson-${Math.random()}`,
};
{
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
