import { Suspense } from 'react';
import { api } from 'trpc-api';
import { getServerSession } from '~/server/auth';
import {
  RecommendedProducts,
  RecommendedProductsSkeleton,
} from './recommended';
import { Reviews, ReviewsSkeleton } from './reviews';
import { SingleProduct } from './single-product';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const product = await api.products.byId.query({ id: params.id });

  return (
    <div className="space-y-8 lg:space-y-14">
      {/* @ts-expect-error Async Server Component */}
      <SingleProduct product={product} />

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
          productId={params.id}
          data={api.reviews.list.query(
            { productId: params.id, delay: 1000 },
            { context: { skipBatch: true } },
          )}
        />
      </Suspense>
    </div>
  );
}
