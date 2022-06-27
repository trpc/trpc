import Image from 'next/image';
import Link from 'next/link';
import { FaDiscord } from 'react-icons/fa';
import { FiGithub, FiTwitter } from 'react-icons/fi';
import { Logo } from '../Logo';
import { NavLink } from '../NavLink';

export const Hero = () => {
  return (
    <div className="px-4 sm:px-6 md:px-8 max-w-screen-xl mx-auto flex justify-between items-center mt-20">
      <div className="flex-1">
        <div className="hidden lg:block">
          <Logo size={86} />
        </div>
        <h1 className="font-bold text-4xl sm:text-5xl lg:text-6xl py-3">
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

        <ul className="flex gap-6 md:hidden pt-6">
          <NavLink href="https://github.com/trpc/trpc" external>
            <FiGithub />
          </NavLink>
          <NavLink href="https://twitter.com/alexdotjs" external>
            <FiTwitter />
          </NavLink>
          <NavLink href="https://discord.com/invite/wzaMgEJkcf" external>
            <FaDiscord />
          </NavLink>
        </ul>
      </div>
      <div className="hidden lg:block flex-1 shadow-lg rounded-xl overflow-hidden">
        <Image
          src="/trpcgif.gif"
          alt="preview"
          layout="responsive"
          width="1024px"
          height="448px"
        />
      </div>
    </div>
  );
};
