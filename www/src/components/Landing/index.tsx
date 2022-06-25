import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '../Logo';
import { Navbar } from '../Navbar';

export const Landing = () => {
  return (
    <div className="min-h-screen grid grid-rows-[auto_1fr] px-48 py-12">
      <Navbar />
      <div className="flex justify-between items-center">
        <div className="flex-[1]">
          <Logo size={86} />
          <h1 className="font-bold text-7xl py-3">
            Build fully typesafe <br /> APIs easily.
          </h1>
          <p className="text-zinc-500 max-w-[80ch]">
            The client doesn&apos;t import any code from the server, only a
            single TypeScript type. The import type declaration is fully erased
            at runtime. tRPC transforms this type into a fully typesafe client.
          </p>
          <div className="flex gap-6 items-center pt-6">
            <Link href="/quickstart">
              <a className="bg-cyan-500 text-zinc-900 px-4 py-2 inline-block rounded-md transition-colors hover:bg-cyan-400 font-bold">
                Quickstart
              </a>
            </Link>
            <Link href="/docs">
              <a className="px-4 py-2 inline-block rounded-md transition-colors border-white border-2 font-bold hover:bg-white hover:text-zinc-900">
                Read docs
              </a>
            </Link>
          </div>
        </div>
        <div className="flex-1 shadow-lg rounded-xl overflow-hidden">
          <Image
            src="/trpcgif.gif"
            alt="preview"
            layout="responsive"
            width="1024px"
            height="448px"
          />
        </div>
      </div>
    </div>
  );
};
