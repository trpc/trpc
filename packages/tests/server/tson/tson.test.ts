import { waitError } from '../___testHelpers';
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
import { tsonParser, tsonStringifier } from './tson';
import { TsonOptions, TsonTypeHandler } from './types';

function setup(opts: TsonOptions) {
  const nonce: TsonOptions['nonce'] = () => '__tson';
  const withDefaults: TsonOptions = {
    nonce,
    ...opts,
  };
  return {
    stringify: tsonStringifier(withDefaults),
    parse: tsonParser(withDefaults),
  };
}

test('Date', async () => {
  const ctx = setup({
    types: {
      Date: DateHandler,
    },
  });

  const date = new Date();

  const stringified = ctx.stringify(date);
  const decoded = ctx.parse(stringified);
  expect(decoded).toEqual(date);
});

test('number', async () => {
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
    const err = await waitError(() => t.parse(t.stringify(n)));
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
    const decoded = t.parse(t.stringify(n));
    expect(decoded).toEqual(n);
  }
});

test('undefined', async () => {
  const ctx = setup({
    types: {
      undefined: undefinedHandler,
    },
  });

  const expected = {
    foo: [1, undefined, 2],
  };
  const stringified = ctx.stringify(expected);
  const decoded = ctx.parse(stringified);

  expect(decoded).toEqual(expected);
});

test('Map', async () => {
  const t = setup({
    types: {
      Map: MapHandler,
    },
  });

  const expected = new Map([['a', 'b']]);

  const stringified = t.stringify(expected);
  const decoded = t.parse(stringified);
  expect(decoded).toEqual(expected);
});

test('Set', async () => {
  const t = setup({
    types: {
      Set: SetHandler,
    },
  });

  const expected = new Set(['a', 'b']);

  const stringified = t.stringify(expected);
  const decoded = t.parse(stringified);
  expect(decoded).toEqual(expected);
});

test('bigint', async () => {
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
    const decoded = t.parse(stringified);

    expect(decoded).toEqual(expected);

    {
      // set of BigInt
      const expected = new Set([1n]);

      const stringified = t.stringify(expected);
      const decoded = t.parse(stringified);

      expect(decoded).toEqual(expected);
    }
    {
      // set of a map of bigint
      const expected = new Set([new Map([['a', 1n]])]);

      const stringified = t.stringify(expected);
      const decoded = t.parse(stringified);

      expect(decoded).toEqual(expected);
    }
  }
});

test('guard unwanted objects', async () => {
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
    const decoded = t.parse(stringified);

    expect(decoded).toEqual(expected);
  }
  {
    // plain objects are okay
    const expected = { a: 1 };
    const stringified = t.stringify(expected);
    const decoded = t.parse(stringified);
    expect(decoded).toEqual(expected);
  }
  {
    // maps are not okay

    const expected = new Map([['a', 1]]);

    const err = await waitError(() => t.parse(t.stringify(expected)));
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

  const decoded = t.parse(stringified);

  expect(decoded).toBeInstanceOf(RegExp);
  expect(decoded).toMatchInlineSnapshot('/foo/g');
  expect(decoded + '').toEqual(expected + '');
});

test('lets have a look at the stringified output', async () => {
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

  const decoded = t.parse(stringified);

  expect(decoded).toEqual(expected);
});
