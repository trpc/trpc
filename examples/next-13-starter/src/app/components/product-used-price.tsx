import { type DineroSnapshot, dinero, toUnit, up } from 'dinero.js';
import { type Product } from '~/server/types';

export const ProductUsedPrice = ({
  usedPrice: usedPriceRaw,
}: {
  usedPrice: Product['usedPrice'];
}) => {
  const usedPrice = dinero(usedPriceRaw as DineroSnapshot<number>);

  return (
    <div className="text-sm">
      <div className="text-gray-400">More buying choices</div>
      <div className="text-gray-200">
        ${toUnit(usedPrice, { digits: 0, round: up })} (used)
      </div>
    </div>
  );
};
