import { dinero } from 'dinero.js';
import Image from 'next/image';
import Link from 'next/link';
import { RouterOutputs } from '~/trpc/shared';
import { ProductEstimatedArrival } from './product-estimated-arrival';
import { ProductLowStockWarning } from './product-low-stock-warning';
import { ProductPrice } from './product-price';
import { ProductRating } from './product-rating';
import { ProductSplitPayments } from './product-split-payments';

type Product = RouterOutputs['products']['byId'];

export function ProductCard(props: { product: Product; href: string }) {
  const product = props.product;

  return (
    <Link href={props.href} className="group block">
      <div className="space-y-2">
        <div className="relative">
          {product.isBestSeller ? (
            <div className="absolute left-2 top-2 z-10 flex">
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

        <div className="group-hover:text-vercel-cyan truncate text-sm font-medium text-white">
          {product.name}
        </div>

        {product.rating ? <ProductRating rating={product.rating} /> : null}

        <ProductPrice price={product.price} discount={product.discount} />

        <ProductSplitPayments price={product.price} />

        <ProductEstimatedArrival leadTime={product.leadTime} />

        {product.stock <= 1 ? (
          <ProductLowStockWarning stock={product.stock} />
        ) : null}
      </div>
    </Link>
  );
}

export function ProductSkeleton() {
  const shimmer = `relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent`;

  return (
    <div className="col-span-4 space-y-4 lg:col-span-1">
      <div className={`relative h-[200px] rounded-xl bg-gray-900 ${shimmer}`} />
      <div className="h-4 w-full rounded-lg bg-gray-900" />
      <div className="h-6 w-1/3 rounded-lg bg-gray-900" />
      <div className="h-4 w-full rounded-lg bg-gray-900" />
      <div className="h-4 w-4/6 rounded-lg bg-gray-900" />
    </div>
  );
}
