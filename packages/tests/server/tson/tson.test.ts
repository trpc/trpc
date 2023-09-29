import { waitError } from '../___testHelpers';
import {
  bigintHandler,
  DateHandler,
  MapHandler,
  SetHandler,
  undefinedHandler,
  unknownObjectGuard,
  UnknownObjectGuardError,
} from './handlers';
import { tsonParser, tsonStringifier } from './tson';
import { TsonOptions } from './types';

function setup(opts: TsonOptions) {
  return {
    stringify: tsonStringifier(opts),
    parse: tsonParser(opts),
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

test('lets have a look at the stringified output', async () => {
  const t = setup({
    types: {
      Set: SetHandler,
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
          ]
        ],
        \\"__tson\\"
      ]
    }"
  `);
});
