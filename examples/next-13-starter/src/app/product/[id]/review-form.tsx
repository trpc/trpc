'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api } from 'trpc-api';

export function ReviewForm() {
  const pathname = usePathname()!;
  const productId = pathname.split('/').pop() as string;

  const [value, setValue] = useState('');

  const [isMutating, setIsMutating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isSubmitting = isPending || isMutating;

  async function handleSubmit() {
    setIsMutating(true);
    setValue('');
    await api.reviews.create.mutate({
      productId,
      rating: 5,
      text: value,
    });
    setIsMutating(false);

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-medium text-white">Write a Review</div>
      {/** TODO: Add form */}
      <input
        type="text"
        disabled={isSubmitting}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="block w-full rounded-lg border-none bg-gray-600 pl-10 font-medium text-gray-200 focus:border-vercel-pink focus:ring-2 focus:ring-vercel-pink"
      />
      <button
        disabled={isSubmitting || !value}
        onClick={handleSubmit}
        className="relative rounded-lg w-full items-center space-x-2 bg-vercel-blue px-3 py-1 text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70 disabled:cursor-not-allowed"
      >
        Submit
        {isSubmitting && (
          <div className="absolute right-2 top-2" role="status">
            <div className="h-4 w-4 animate-spin rounded-full border-[3px] border-white border-r-transparent" />
            <span className="sr-only">Loading...</span>
          </div>
        )}
      </button>
    </div>
  );
}
