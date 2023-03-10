import { getServerSession } from 'next-auth/next';
import Link from 'next/link';
import { authOptions } from '~/pages/api/auth/[...nextauth]';

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-center text-2xl font-bold">tRPC App Playground</h1>

      <Link
        href="/product/1"
        className="bg-gray-800 text-gray-200 px-5 py-3 rounded text-center"
      >
        Go to product page
      </Link>
      <Link
        href="/api/auth/signin"
        className="bg-gray-800 text-gray-200 px-5 py-3 rounded"
      >
        Sign In (NextAuth)
      </Link>
      <pre>{JSON.stringify(session)}</pre>
    </div>
  );
}
