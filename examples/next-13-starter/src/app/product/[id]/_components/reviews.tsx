import { getServerSession } from 'next-auth/next';
import { revalidateTag } from 'next/cache';
import Link from 'next/link';
import { Suspense } from 'react';
import { api } from 'trpc-api';
import { authOptions } from '~/app/api/auth/[...nextauth]/opts';
import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { ProductReviewCard } from '~/components/product-review-card';
import { RouterOutputs } from '~/trpc/shared';

export async function Reviews(props: {
  productId: string;
  data: Promise<RouterOutputs['reviews']['list']>;
}) {
  const reviews = await props.data;
  const me = (await getServerSession(authOptions))?.user;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-lg font-medium text-white">Customer Reviews</div>
        <div className="text-sm text-gray-400">
          Read what other people think of this product.{' '}
          {!me && (
            <>
              <Link
                href="/api/auth/signin"
                className="underline decoration-dotted underline-offset-2 hover:text-white"
              >
                Sign in
              </Link>{' '}
              to write your own.
            </>
          )}
        </div>
      </div>
      {me && (
        <div className="space-y-4">
          <div className="text-lg font-medium text-white">Write a Review</div>
          <form
            className="space-y-2"
            action={async (fd) => {
              'use server';

              await api.reviews.create.mutate({
                productId: props.productId,
                text: fd.get('text') as string,
                rating: Math.floor(Math.random() * 5) + 1,
              });
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // TODO: trpc.reviews.list.revalidate({ productId: props.productId });
              revalidateTag('reviews.list');
            }}
          >
            <Input name="text" />
            <Button type="submit" className="w-full">
              Submit
            </Button>
          </form>
        </div>
      )}
      <Suspense fallback={<ReviewsList.Skeleton />}>
        {/** @ts-expect-error - Async Server Component */}
        <ReviewsList
          data={api.reviews.list.query({ productId: props.productId })}
        />
      </Suspense>
    </div>
  );
}

async function ReviewsList(props: {
  data: Promise<RouterOutputs['reviews']['list']>;
}) {
  const reviews = await props.data;

  return (
    <div className="space-y-8">
      {reviews.map((review) => {
        return <ProductReviewCard key={review.id} review={review} />;
      })}
    </div>
  );
}

ReviewsList.Skeleton = function Skeleton(props: { n?: number }) {
  const { n = 3 } = props;
  return (
    <div className="space-y-8">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="space-y-4">
          <div className="h-6 w-2/6 rounded-lg bg-gray-900" />
          <div className="h-4 w-1/6 rounded-lg bg-gray-900" />
          <div className="h-4 w-full rounded-lg bg-gray-900" />
          <div className="h-4 w-4/6 rounded-lg bg-gray-900" />
        </div>
      ))}
    </div>
  );
};
