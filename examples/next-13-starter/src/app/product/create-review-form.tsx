'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api } from 'trpc-api';

export function CreateReviewForm(props: { productId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [text, setText] = useState('');

  async function handleSubmit() {
    setIsCreating(true);
    const review = await api.reviews.create.mutate({
      productId: props.productId,
      rating: Math.floor(Math.random() * 5) + 1,
      text,
    });
    setIsCreating(false);

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form className="space-y-2">
      <input
        className="block w-full rounded-lg border-none bg-gray-600 px-2 font-medium text-gray-200 focus:border-vercel-pink focus:ring-2 focus:ring-vercel-pink"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={() => void handleSubmit()}
        disabled={isCreating || !text || isPending}
        className="relative rounded-lg w-full items-center space-x-2 bg-vercel-blue px-3 py-1 text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70 disabled:cursor-not-allowed disabled:hover:bg-vercel-blue"
      >
        Submit
      </button>
    </form>
  );
}
