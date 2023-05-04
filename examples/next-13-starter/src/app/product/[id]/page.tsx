import { Suspense } from 'react';
import { api } from 'trpc-api';
import {
  RecommendedProducts,
  RecommendedProductsSkeleton,
} from './_components/recommended';
import { Reviews } from './_components/reviews';
import { SingleProduct } from './_components/single-product';

// export const runtime = 'edge';

export default async function Page(props: { params: { id: string } }) {
  return (
    <div className="space-y-8 lg:space-y-14">
      {/* @ts-expect-error Async Server Component */}
      <SingleProduct data={api.products.byId.query({ id: props.params.id })} />

      <Suspense fallback={<RecommendedProductsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <RecommendedProducts
          path="/product"
          data={api.products.list.query({
            filter: props.params.id,
            delay: 500,
          })}
        />
      </Suspense>

      {/* @ts-expect-error Async Server Component */}
      <Reviews productId={props.params.id} />
    </div>
  );
}
