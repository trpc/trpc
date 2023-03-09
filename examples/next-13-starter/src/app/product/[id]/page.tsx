import { Suspense } from 'react';
import { api } from 'trpc-api';
import {
  RecommendedProducts,
  RecommendedProductsSkeleton,
} from './recommended';
import { Reviews, ReviewsSkeleton } from './reviews';
import { SingleProduct } from './single-product';

export const runtime = 'edge';

export default async function Page({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-8 lg:space-y-14">
      {/* @ts-expect-error Async Server Component */}
      <SingleProduct data={api.products.byId.query({ id: params.id })} />

      <Suspense fallback={<RecommendedProductsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <RecommendedProducts
          path="/product"
          data={api.products.list.query(
            { filter: params.id, delay: 500 },
            { context: { skipBatch: true } },
          )}
        />
      </Suspense>

      <Suspense fallback={<ReviewsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <Reviews
          data={api.reviews.list.query(
            { delay: 1000 },
            { context: { skipBatch: true } },
          )}
        />
      </Suspense>
    </div>
  );
}
