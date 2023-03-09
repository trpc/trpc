import { type Dinero, toFormat } from 'dinero.js';

export const ProductCurrencySymbol = ({
  dinero,
}: {
  dinero: Dinero<number>;
}) => {
  switch (toFormat(dinero, ({ currency }) => currency.code)) {
    case 'GBP':
      return <>£</>;

    case 'EUR':
      return <>€</>;

    default:
      return <>$</>;
  }
};
