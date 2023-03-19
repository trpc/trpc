import { api } from 'trpc-api';
import { ProductReviewCard } from '~/components/product-review-card';
import { RouterOutputs } from '~/trpc/shared';

async function createReview(fd: FormData) {
  'use server';
  const review = await api.reviews.create.mutate({
    productId: '1', // parse from url
    rating: 5,
    text: fd.get('text') as string,
  });
  console.log(review);
}

export async function Reviews(props: {
  data: Promise<RouterOutputs['reviews']['list']>;
}) {
  const reviews = await props.data;

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium text-white">Customer Reviews</div>
      <div className="space-y-4">
        <div className="text-lg font-medium text-white">Write a Review</div>
        <form action="" method="POST" className="space-y-2  ">
          {/** @ts-expect-error - how tf do i type action id??? */}
          <input name="$$id" value={createReview.$$id} hidden readOnly />
          <input
            name="text"
            className="block w-full rounded-lg border-none bg-gray-600 px-2 font-medium text-gray-200 focus:border-vercel-pink focus:ring-2 focus:ring-vercel-pink"
          />
          <button
            type="submit"
            className="relative rounded-lg w-full items-center space-x-2 bg-vercel-blue px-3 py-1 text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </form>
      </div>
      <div className="space-y-8">
        {reviews.map((review) => {
          return <ProductReviewCard key={review.id} review={review} />;
        })}
      </div>
    </div>
  );
}

export function ReviewsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-2/5 rounded-lg bg-gray-900 relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent" />
      <div className="space-y-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-4">
            <div className="h-6 w-2/6 rounded-lg bg-gray-900" />
            <div className="h-4 w-1/6 rounded-lg bg-gray-900" />
            <div className="h-4 w-full rounded-lg bg-gray-900" />
            <div className="h-4 w-4/6 rounded-lg bg-gray-900" />
          </div>
        ))}
      </div>
    </div>
  );
}
