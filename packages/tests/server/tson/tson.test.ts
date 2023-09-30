import {
  bigintHandler,
  DateHandler,
  MapHandler,
  numberHandler,
  RegExpHandler,
  SetHandler,
  undefinedHandler,
  unknownObjectGuard,
  UnknownObjectGuardError,
} from './handlers';
import {
  tsonDeserializer,
  tsonParser,
  tsonSerializer,
  tsonStringifier,
} from './tson';
import { TsonNonce, TsonOptions } from './types';

const expectError = (fn: () => unknown) => {
  let err: unknown;
  try {
    fn();
  } catch (_err) {
    err = _err;
  }
  expect(err).toBeDefined();
  expect(err).toBeInstanceOf(Error);
  return err as Error;
};
const ignoreErrrors = (fn: () => unknown) => {
  try {
    fn();
  } catch (_err) {
    // ignore
  }
};

function setup(opts: TsonOptions) {
  const nonce: TsonOptions['nonce'] = () => '__tson';
  const withDefaults: TsonOptions = {
    nonce,
    ...opts,
  };
  return {
    stringify: tsonStringifier(withDefaults),
    parse: tsonParser(withDefaults),
    serializer: tsonSerializer(withDefaults),
    deserialize: tsonDeserializer(withDefaults),
  };
}

test('Date', () => {
  const ctx = setup({
    types: {
      Date: DateHandler,
    },
  });

  const date = new Date();

  const stringified = ctx.stringify(date);
  const deserialized = ctx.parse(stringified);
  expect(deserialized).toEqual(date);
});

test('number', () => {
  const t = setup({
    types: {
      number: numberHandler,
    },
  });

  const bad = [
    //
    NaN,
    Infinity,
    -Infinity,
  ];
  const good = [1, 0, -1, 1.1, -1.1];

  const errors: unknown[] = [];

  for (const n of bad) {
    const err = expectError(() => t.parse(t.stringify(n)));
    errors.push(err);
  }

  expect(errors).toMatchInlineSnapshot(`
    Array [
      [Error: Encountered NaN],
      [Error: Encountered Infinity],
      [Error: Encountered Infinity],
    ]
  `);

  for (const n of good) {
    const deserialized = t.parse(t.stringify(n));
    expect(deserialized).toEqual(n);
  }
});

test('undefined', () => {
  const ctx = setup({
    types: {
      undefined: undefinedHandler,
    },
  });

  const expected = {
    foo: [1, undefined, 2],
  } as const;
  const stringified = ctx.stringify(expected);
  const deserialized = ctx.parse(stringified);

  expect(deserialized).toEqual(expected);
});

test('Map', () => {
  const t = setup({
    types: {
      Map: MapHandler,
    },
  });

  const expected = new Map([['a', 'b']]);

  const stringified = t.stringify(expected);
  const deserialized = t.parse(stringified);
  expect(deserialized).toEqual(expected);
});

test('Set', () => {
  const t = setup({
    types: {
      Set: SetHandler,
    },
  });

  const expected = new Set(['a', 'b']);

  const stringified = t.stringify(expected);
  const deserialized = t.parse(stringified);
  expect(deserialized).toEqual(expected);
});

test('bigint', () => {
  const t = setup({
    types: {
      bigint: bigintHandler,
      Set: SetHandler,
      Map: MapHandler,
    },
  });

  {
    // bigint
    const expected = 1n;

    const stringified = t.stringify(expected);
    const deserialized = t.parse(stringified);

    expect(deserialized).toEqual(expected);

    {
      // set of BigInt
      const expected = new Set([1n]);

      const stringified = t.stringify(expected);
      const deserialized = t.parse(stringified);

      expect(deserialized).toEqual(expected);
    }
    {
      // set of a map of bigint
      const expected = new Set([new Map([['a', 1n]])]);

      const stringified = t.stringify(expected);
      const deserialized = t.parse(stringified);

      expect(deserialized).toEqual(expected);
    }
  }
});

test('guard unwanted objects', () => {
  // Sets are okay, but not Maps
  const t = setup({
    types: {
      Set: SetHandler,
      // defined last so it runs last
      unknownObjectGuard,
    },
  });

  {
    // sets are okay

    const expected = new Set([1]);

    const stringified = t.stringify(expected);
    const deserialized = t.parse(stringified);

    expect(deserialized).toEqual(expected);
  }
  {
    // plain objects are okay
    const expected = { a: 1 };
    const stringified = t.stringify(expected);
    const deserialized = t.parse(stringified);
    expect(deserialized).toEqual(expected);
  }
  {
    // maps are not okay

    const expected = new Map([['a', 1]]);

    const err = expectError(() => t.parse(t.stringify(expected)));
    assert(err instanceof UnknownObjectGuardError);

    expect(err).toMatchInlineSnapshot(
      '[UnknownObjectGuardError: Unknown object found]',
    );
    expect(err.value).toEqual(expected);
  }
});

test('regex', () => {
  const t = setup({
    types: {
      RegExp: RegExpHandler,
    },
  });

  const expected = new RegExp('foo', 'g');

  const stringified = t.stringify(expected, 2);

  expect(stringified).toMatchInlineSnapshot(
    `
    "{
      \\"nonce\\": \\"__tson\\",
      \\"json\\": [
        \\"RegExp\\",
        \\"/foo/g\\",
        \\"__tson\\"
      ]
    }"
  `,
  );

  const deserialized = t.parse(stringified);

  expect(deserialized).toBeInstanceOf(RegExp);
  expect(deserialized).toMatchInlineSnapshot('/foo/g');
  expect(deserialized + '').toEqual(expected + '');
});

test('lets have a look at the stringified output', () => {
  const t = setup({
    types: {
      Set: SetHandler,
      Map: MapHandler,
      undefined: undefinedHandler,
      bigint: bigintHandler,
    },
  });

  const expected = new Set([
    //
    1,
    'string',
    undefined,
    null,
    true,
    false,
    1n,
    new Map([['foo', 'bar']]),
  ]);

  const stringified = t.stringify(expected, 2);

  expect(stringified).toMatchInlineSnapshot(`
    "{
      \\"nonce\\": \\"__tson\\",
      \\"json\\": [
        \\"Set\\",
        [
          1,
          \\"string\\",
          [
            \\"undefined\\",
            0,
            \\"__tson\\"
          ],
          null,
          true,
          false,
          [
            \\"bigint\\",
            \\"1\\",
            \\"__tson\\"
          ],
          [
            \\"Map\\",
            [
              [
                \\"foo\\",
                \\"bar\\"
              ]
            ],
            \\"__tson\\"
          ]
        ],
        \\"__tson\\"
      ]
    }"
  `);

  const deserialized = t.parse(stringified);

  expect(deserialized).toEqual(expected);
});

test('types', () => {
  const t = setup({
    types: {
      bigint: bigintHandler,
    },
  });

  const expected = 1n;
  {
    const stringified = t.stringify(expected);
    const parsed = t.parse(stringified);
    expectTypeOf(parsed).toEqualTypeOf(expected);
  }
  {
    const serialized = t.serializer(expected);
    const deserialized = t.deserialize(serialized);

    expectTypeOf(deserialized).toEqualTypeOf(expected);
  }
});
