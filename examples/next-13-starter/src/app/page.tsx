import Link from 'next/link';
import { Suspense } from 'react';
import { api } from 'trpc-api';
import { ProductCard } from '~/components/product-card';
import { ProductSkeleton } from './product/[id]/(components)/recommended';

export const runtime = 'edge';

export default async function Home() {
  const me = await api.me.query();

  return (
    <div className="flex flex-col gap-4 text-gray-200">
      <h1 className="text-center text-4xl font-bold">tRPC App Playground</h1>

      <p className="text-gray-400">
        This playground is made to showcase different data fetching patterns in
        Next.js 13 using the new App router together with tRPC.
      </p>

      <h2 className="text-lg">Browse Products</h2>
      <div className="bg-vc-border-gradient w-1/3 rounded-lg p-px shadow-lg shadow-black/20">
        <div className="rounded-lg bg-black p-4">
          <Suspense fallback={<ProductSkeleton />}>
            {/* @ts-expect-error - Async Server Component */}
            <ProductCard
              href="/product/1"
              product={api.products.byId.query({ id: '1', delay: 500 })}
            />
          </Suspense>
        </div>
      </div>

      <div className="mt-4 border-b border-gray-700" />

      {me && <span className="text-gray-400">Hello {me.name}!</span>}
      <Link
        href={me ? '/api/auth/signout' : '/api/auth/signin'}
        className="rounded bg-gray-800 px-5 py-3"
      >
        {me ? 'Sign Out' : 'Sign In'}
      </Link>
    </div>
  );
}
