import Link from 'next/link';
import { SignIn } from './auth-actions';

export default async function Home() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-center text-2xl font-bold">tRPC App Playground</h1>

      <Link
        href="/product/1"
        className="bg-gray-800 text-gray-200 px-5 py-3 rounded text-center"
      >
        Go to product page
      </Link>
      <SignIn>
        <div className="bg-gray-800 text-gray-200 px-5 py-3 rounded">
          Sign In
        </div>
      </SignIn>
    </div>
  );
}
