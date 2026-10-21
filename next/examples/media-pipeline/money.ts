/**
 * `Money`, a class of the app's own, kept across the wire by both
 * transformers: danSON through a `CustomType`, superjson through
 * `registerCustom`.
 */
import {
  createSerializer,
  createSyncTransformer,
} from '@trpc12/trpc/transformer';
import type { CustomType } from '@trpc12/trpc/transformer';
import SuperJSON from 'superjson';

export class Money {
  /** Minor units, so sums stay exact. */
  readonly cents: number;
  readonly currency: 'EUR' | 'USD';

  constructor(cents: number, currency: Money['currency']) {
    this.cents = cents;
    this.currency = currency;
  }

  plus(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new Error(`Can't add ${other.currency} to ${this.currency}`);
    }
    return new Money(this.cents + other.cents, this.currency);
  }

  times(n: number): Money {
    return new Money(this.cents * n, this.currency);
  }

  toString(): string {
    return `${(this.cents / 100).toFixed(2)} ${this.currency}`;
  }
}

interface MoneyJson {
  cents: number;
  currency: Money['currency'];
}

const money: CustomType<Money, MoneyJson> = {
  is: (v) => v instanceof Money,
  serialize: (v) => ({ cents: v.cents, currency: v.currency }),
  deserialize: (v) => new Money(v.cents, v.currency),
};

/** danSON: native types, files and deferred values at any depth, plus `Money`. */
export const danson = createSerializer({ types: { Money: money } });

const superjson = new SuperJSON();
superjson.registerCustom<Money, string>(
  {
    isApplicable: (v): v is Money => v instanceof Money,
    serialize: (v) => JSON.stringify(money.serialize(v)),
    deserialize: (v) => money.deserialize(JSON.parse(v) as MoneyJson),
  },
  'Money',
);

/**
 * superjson, the way a v11 app's `transformer` worked. It rebuilds the types
 * listed here; files only travel as a whole, unbatched output.
 */
export const sync = createSyncTransformer<
  Date | Money | ReadonlySet<unknown> | ReadonlyMap<unknown, unknown>
>(superjson);
