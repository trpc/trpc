import { multiply, toUnit, type Dinero } from 'dinero.js';
import { CurrencySymbol } from '~/app/utils/currency-symbol';
import { RouterOutputs } from '~/trpc/shared';
import { ProductDeal } from './product-deal';
import { ProductLighteningDeal } from './product-lightening-deal';

type Product = RouterOutputs['products']['byId'];

function isDiscount(obj: any): obj is { percent: number; expires?: number } {
  return typeof obj?.percent === 'number';
}

function formatDiscount(
  price: Dinero<number>,
  discountRaw: Product['discount'],
) {
  return isDiscount(discountRaw)
    ? {
        amount: multiply(price, {
          amount: discountRaw.percent,
          scale: 2,
        }),
        expires: discountRaw.expires,
      }
    : undefined;
}

export const ProductPrice = ({
  price,
  discount: discountRaw,
}: {
  price: Dinero<number>;
  discount: Product['discount'];
}) => {
  const discount = formatDiscount(price, discountRaw);

  if (discount) {
    if (discount?.expires && typeof discount.expires === 'number') {
      return <ProductLighteningDeal price={price} discount={discount} />;
    }
    return <ProductDeal price={price} discount={discount} />;
  }

  return (
    <div className="flex">
      <div className="text-sm leading-snug text-white">
        <CurrencySymbol dinero={price} />
      </div>
      <div className="text-lg font-bold leading-snug text-white">
        {toUnit(price)}
      </div>
    </div>
  );
};
