import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import React from 'react';
import { Boundary } from '~/components/boundary';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { Header } from './header';

export const metadata = {
  title: 'Streaming (Edge Runtime)',
};

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cartCount = Number(cookies().get('_cart_count')?.value || '0');
  const session = await getServerSession(authOptions);
  const user = session?.user;

  return (
    <>
      <div className="prose prose-sm prose-invert mb-8 max-w-none">
        <ul>
          <li>
            Primary product information is loaded first as part of the initial
            response.
          </li>
          <li>
            Secondary, more personalized details (that might be slower) like
            ship date, other recommended products, and customer reviews are
            progressively streamed in.
          </li>
          <li>Try refreshing or navigating to other recommended products.</li>
        </ul>
      </div>

      <Boundary animateRerendering={false} labels={['Demo']} size="small">
        <div className="space-y-10">
          {/** @ts-expect-error Async Server Component */}
          <Header user={user} />

          {children}
        </div>
      </Boundary>
    </>
  );
}
