import Link from 'next/link';
import { api } from 'trpc-api';

export const runtime = 'edge';

export default async function Home() {
  const user = await api.me.query();

  return (
    <div className="flex flex-col gap-4 text-gray-200">
      <h1 className="text-center text-2xl font-bold">tRPC App Playground</h1>

      <Link href="/product/1" className="rounded bg-gray-800 px-5 py-3">
        Go to product page
      </Link>
      {user && <span>Hello {user.name}!</span>}
      <Link
        href={user ? '/api/auth/signout' : '/api/auth/signin'}
        className="rounded bg-gray-800 px-5 py-3"
      >
        {user ? 'Sign Out' : 'Sign In'}
      </Link>
    </div>
  );
}
