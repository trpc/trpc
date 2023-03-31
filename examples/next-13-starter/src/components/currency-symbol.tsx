import { toFormat, type Dinero } from 'dinero.js';

export const CurrencySymbol = (props: { dinero: Dinero<number> }) => {
  switch (toFormat(props.dinero, ({ currency }) => currency.code)) {
    case 'GBP':
      return <>£</>;

    case 'EUR':
      return <>€</>;

    default:
      return <>$</>;
  }
};
