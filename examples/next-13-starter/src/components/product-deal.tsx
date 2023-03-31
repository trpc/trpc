import { toUnit, type Dinero } from 'dinero.js';
import { CurrencySymbol } from '~/app/utils/currency-symbol';

export const ProductDeal = ({
  price: priceRaw,
  discount: discountRaw,
}: {
  price: Dinero<number>;
  discount: {
    amount: Dinero<number>;
  };
}) => {
  const discount = toUnit(discountRaw.amount);
  const price = toUnit(priceRaw);
  const percent = Math.round(100 - (discount / price) * 100);

  return (
    <div className="flex gap-x-1.5">
      <div className="text-vercel-cyan text-lg font-bold leading-snug">
        -{percent}%
      </div>
      <div className="flex">
        <div className="text-sm leading-snug text-white">
          <CurrencySymbol dinero={discountRaw.amount} />
        </div>
        <div className="text-lg font-bold leading-snug text-white">
          {discount}
        </div>
      </div>
      <div className="text-sm leading-snug text-gray-400 line-through">
        <CurrencySymbol dinero={priceRaw} />

        {price}
      </div>
    </div>
  );
};
