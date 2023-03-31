import { Search, ShoppingCart, User } from 'lucide-react';
import { type User as NextAuthUser } from 'next-auth';
import Image from 'next/image';
import Link from 'next/link';

export async function Header({ user }: { user: NextAuthUser }) {
  return (
    <div className="flex items-center justify-between gap-x-3 rounded-lg bg-gray-800 px-3 py-3 lg:px-5 lg:py-4">
      <div className="flex gap-x-3">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-5 w-5 text-gray-300" />
          </div>
          <input
            aria-label="Search"
            type="search"
            name="search"
            id="search"
            className="focus:border-vercel-pink focus:ring-vercel-pink block w-full rounded-full border-none bg-gray-600 pl-10 font-medium text-gray-200 focus:ring-2"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex shrink-0 gap-x-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-600 text-white">
          <ShoppingCart className="w-6 text-white" />
          <div className="bg-vercel-cyan absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-sm font-bold text-cyan-800">
            ?
          </div>
        </div>

        {user ? (
          <Link href="/api/auth/signout">
            <Image
              src={user.image as string}
              className="rounded-full"
              width={40}
              height={40}
              alt="User"
            />
          </Link>
        ) : (
          <Link href="/api/auth/signin">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-600 text-white">
              <User
                className="w-6 text-white"
                aria-label="User"
                aria-hidden="true"
              />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
