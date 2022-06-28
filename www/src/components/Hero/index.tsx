import Image from 'next/image';
import Link from 'next/link';
import { FaDiscord } from 'react-icons/fa';
import { FiGithub, FiTwitter } from 'react-icons/fi';
import { Logo } from '../Logo';
import { NavLink } from '../NavLink';

export const Hero = () => {
  return (
    <div className="flex justify-between items-center px-4 py-24 mx-auto max-w-screen-xl md:py-36 sm:px-6 md:px-8">
      <div className="flex-1">
        <div className="hidden lg:block">
          <Logo size={86} />
        </div>
        <h1 className="py-3 text-3xl font-bold sm:text-4xl lg:text-5xl">
          Build fully typesafe <br /> APIs easily.
        </h1>
        <p className="text-zinc-500 max-w-[80ch]">
          The client doesn&apos;t import any code from the server, only a single
          TypeScript type. The import type declaration is fully erased at
          runtime. tRPC transforms this type into a fully typesafe client.
        </p>
        <div className="flex gap-6 items-center pt-6">
          <Link href="/quickstart">
            <a className="inline-block px-4 py-2 font-bold bg-cyan-500 rounded-md transition-colors text-zinc-900 hover:bg-cyan-400">
              Quickstart
            </a>
          </Link>
          <Link href="/docs">
            <a className="inline-block px-4 py-2 font-bold rounded-md border-2 border-white transition-colors hover:bg-white hover:text-zinc-900">
              Read docs
            </a>
          </Link>
        </div>

        <ul className="flex gap-6 pt-6 md:hidden">
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
      <div className="hidden overflow-hidden flex-1 rounded-xl shadow-lg lg:block">
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
