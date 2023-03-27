import { Suspense } from 'react';
import { api } from 'trpc-api';
import { ProductEstimatedArrival } from '~/components/product-estimated-arrival';
import { ProductLowStockWarning } from '~/components/product-low-stock-warning';
import { ProductPrice } from '~/components/product-price';
import { ProductSplitPayments } from '~/components/product-split-payments';
import { RouterOutputs } from '~/trpc/shared';

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

  return (
    <>
      <ProductSplitPayments price={product.price} />
      <ProductEstimatedArrival leadTime={product.leadTime} hasDeliveryTime />
      {product.stock <= 1 ? (
        <ProductLowStockWarning stock={product.stock} />
      ) : null}
    </>
  );
}

export function Pricing({
  product,
}: {
  product: RouterOutputs['products']['byId'];
}) {
  return (
    <div className="space-y-4 rounded-lg bg-gray-900 p-3">
      <ProductPrice price={product.price} discount={product.discount} />

      <Suspense fallback={<LoadingDots />}>
        {/* @ts-expect-error Async Server Component */}
        <UserSpecificDetails productId={product.id} />
      </Suspense>
    </div>
  );
}
