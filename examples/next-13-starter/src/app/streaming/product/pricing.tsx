import { type DineroSnapshot, dinero } from 'dinero.js';
import { Suspense } from 'react';
import { api } from 'trpc-api';
import { ProductEstimatedArrival } from '~/app/components/product-estimated-arrival';
import { ProductLowStockWarning } from '~/app/components/product-low-stock-warning';
import { ProductPrice } from '~/app/components/product-price';
import { ProductSplitPayments } from '~/app/components/product-split-payments';
import { ProductUsedPrice } from '~/app/components/product-used-price';
import type { Product } from '~/server/types';
import { AddToCart } from './add-to-cart';

function LoadingDots() {
  return (
    <div className="text-sm">
      <span className="space-x-0.5">
        <span className="inline-flex animate-[loading_1.4s_ease-in-out_infinite] rounded-full">
          &bull;
        </span>
        <span className="inline-flex animate-[loading_1.4s_ease-in-out_0.2s_infinite] rounded-full">
          &bull;
        </span>
        <span className="inline-flex animate-[loading_1.4s_ease-in-out_0.4s_infinite] rounded-full">
          &bull;
        </span>
      </span>
    </div>
  );
}

async function UserSpecificDetails({ productId }: { productId: string }) {
  const product = await api.products.byId.query({ id: productId, delay: 500 });
  const price = dinero(product.price as DineroSnapshot<number>);

  return (
    <>
      <ProductSplitPayments price={price} />
      {product.usedPrice ? (
        <ProductUsedPrice usedPrice={product.usedPrice} />
      ) : null}
      <ProductEstimatedArrival leadTime={product.leadTime} hasDeliveryTime />
      {product.stock <= 1 ? (
        <ProductLowStockWarning stock={product.stock} />
      ) : null}
    </>
  );
}

export function Pricing({
  product,
  cartCount,
}: {
  product: Product;
  cartCount: string;
}) {
  const price = dinero(product.price as DineroSnapshot<number>);

  return (
    <div className="space-y-4 rounded-lg bg-gray-900 p-3">
      <ProductPrice price={price} discount={product.discount} />

      <Suspense fallback={<LoadingDots />}>
        {/* @ts-expect-error Async Server Component */}
        <UserSpecificDetails productId={product.id} />
      </Suspense>

      <AddToCart initialCartCount={Number(cartCount)} />
    </div>
  );
}
