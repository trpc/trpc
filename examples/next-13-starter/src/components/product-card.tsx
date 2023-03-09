import { type DineroSnapshot, dinero } from 'dinero.js';
import Image from 'next/image';
import Link from 'next/link';
import { type Product } from '~/server/types';
import { ProductEstimatedArrival } from './product-estimated-arrival';
import { ProductLowStockWarning } from './product-low-stock-warning';
import { ProductPrice } from './product-price';
import { ProductRating } from './product-rating';
import { ProductSplitPayments } from './product-split-payments';

export const ProductCard = ({
  product,
  href,
}: {
  product: Product;
  href: string;
}) => {
  const price = dinero(product.price);

  return (
    <Link href={href} className="group block">
      <div className="space-y-2">
        <div className="relative">
          {product.isBestSeller ? (
            <div className="absolute top-2 left-2 z-10 flex">
              <div className="rounded bg-gray-600 px-1.5 text-xs font-medium leading-5 text-white">
                Best Seller
              </div>
            </div>
          ) : null}
          <Image
            src={`/${product.image}`}
            width={400}
            height={400}
            className="rounded-xl grayscale group-hover:opacity-80"
            alt={product.name}
          />
        </div>

        <div className="truncate text-sm font-medium text-white group-hover:text-vercel-cyan">
          {product.name}
        </div>

        {product.rating ? <ProductRating rating={product.rating} /> : null}

        <ProductPrice price={price} discount={product.discount} />

        <ProductSplitPayments price={price} />

        <ProductEstimatedArrival leadTime={product.leadTime} />

        {product.stock <= 1 ? (
          <ProductLowStockWarning stock={product.stock} />
        ) : null}
      </div>
    </Link>
  );
};
