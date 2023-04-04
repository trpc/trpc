import { Suspense } from 'react';
import { api } from 'trpc-api';
import {
  RecommendedProducts,
  RecommendedProductsSkeleton,
} from './(components)/recommended';
import { Reviews, ReviewsSkeleton } from './(components)/reviews';
import { SingleProduct } from './(components)/single-product';

export const runtime = 'edge';

export default async function Page(props: { params: { id: string } }) {
  return (
    <div className="space-y-8 lg:space-y-14">
      {/* @ts-expect-error Async Server Component */}
      <SingleProduct data={api.products.byId.query({ id: props.params.id })} />

      <Suspense fallback={<RecommendedProductsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <RecommendedProducts
          path="/product"
          data={api.products.list.query(
            { filter: props.params.id, delay: 250 },
            { context: { skipBatch: true } },
          )}
        />
      </Suspense>

      <Suspense fallback={<ReviewsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <Reviews
          productId={props.params.id}
          data={api.reviews.list.query(
            { productId: props.params.id, delay: 500 },
            { context: { skipBatch: true } },
          )}
        />
      </Suspense>
    </div>
  );
}
