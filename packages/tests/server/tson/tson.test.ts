import { waitError } from '../___testHelpers';
import {
  bigintHandler,
  DateHandler,
  MapHandler,
  SetHandler,
  undefinedHandler,
} from './handlers';
import { isPlainObject } from './isPlainObject';
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

  const encoded = ctx.stringify(date);
  const decoded = ctx.parse(encoded);
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
  const encoded = ctx.stringify(expected);
  const decoded = ctx.parse(encoded);

  expect(decoded).toEqual(expected);
});

test('Map', async () => {
  const t = setup({
    types: {
      Map: MapHandler,
    },
  });

  const expected = new Map([['a', 'b']]);

  const encoded = t.stringify(expected);
  const decoded = t.parse(encoded);
  expect(decoded).toEqual(expected);
});

test('Set', async () => {
  const t = setup({
    types: {
      Set: SetHandler,
    },
  });

  const expected = new Set(['a', 'b']);

  const encoded = t.stringify(expected);
  const decoded = t.parse(encoded);
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

    const encoded = t.stringify(expected);
    const decoded = t.parse(encoded);

    expect(decoded).toEqual(expected);

    {
      // set of BigInt
      const expected = new Set([1n]);

      const encoded = t.stringify(expected);
      const decoded = t.parse(encoded);

      expect(decoded).toEqual(expected);
    }
    {
      // set of a map of bigint
      const expected = new Set([new Map([['a', 1n]])]);

      const encoded = t.stringify(expected);
      const decoded = t.parse(encoded);

      expect(decoded).toEqual(expected);
    }
  }
});

test('guard unwanted objects', async () => {
  class BadObjectFoundError extends Error {
    constructor(public value: unknown) {
      super(`Unwanted object found`);

      this.name = this.constructor.name;
    }
  }
  // Sets are okay, but not Maps
  const t = setup({
    types: {
      Set: SetHandler,
      // defined last so it runs last
      guard: {
        transform: false,
        test(v) {
          if (
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            !isPlainObject(v)
          ) {
            throw new BadObjectFoundError(v);
          }
          return false;
        },
      },
    },
  });

  {
    // sets are okay

    const expected = new Set([1]);

    const encoded = t.stringify(expected);
    const decoded = t.parse(encoded);

    expect(decoded).toEqual(expected);
  }
  {
    // plain objects are okay
    const expected = { a: 1 };
    const encoded = t.stringify(expected);
    const decoded = t.parse(encoded);
    expect(decoded).toEqual(expected);
  }
  {
    // maps are not okay

    const expected = new Map([['a', 1]]);

    const err = await waitError(() => t.parse(t.stringify(expected)));
    assert(err instanceof BadObjectFoundError);

    expect(err).toMatchInlineSnapshot(
      '[BadObjectFoundError: Unwanted object found]',
    );
    expect(err.value).toEqual(expected);
  }
});
