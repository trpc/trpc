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

export default async function Page(props: { params: { id: string } }) {
  return (
    <div className="space-y-8 lg:space-y-14">
      <Suspense>
        {/* @ts-expect-error Async Server Component */}
        <SingleProduct
          product={api.products.byId.query({ id: props.params.id })}
        />
      </Suspense>
      <Suspense fallback={<RecommendedProductsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <RecommendedProducts
          path="/product"
          data={api.products.list.query(
            { filter: props.params.id },
            { context: { skipBatch: true, delay: 1000 } },
          )}
        />
      </Suspense>

      <Suspense fallback={<ReviewsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <Reviews
          productId={props.params.id}
          data={api.reviews.list.query(
            { productId: props.params.id, delay: 1500 },
            { context: { skipBatch: true } },
          )}
        />
      </Suspense>
    </div>
  );
}
