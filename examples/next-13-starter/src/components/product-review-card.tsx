import Image from 'next/image';
import { RouterOutputs } from 'trpc-api';
import { ProductRating } from './product-rating';

type Review = RouterOutputs['reviews']['list'][number];

export const ProductReviewCard = ({ review }: { review: Review }) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-x-2">
          {review.user.image ? (
            <Image
              src={review.user.image}
              alt={review.user.name + "'s avatar"}
              width={48}
              height={48}
              className="rounded-full"
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-gray-700" />
          )}
          <div className="text-sm text-white">{review.user.name}</div>
        </div>

        {review.rating ? <ProductRating rating={review.rating} /> : null}
      </div>

      <div className="text-gray-400">{review.comment}</div>
    </div>
  );
};
