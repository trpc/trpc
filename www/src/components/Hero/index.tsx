import Image from 'next/image';
import { FaDiscord } from 'react-icons/fa';
import { FiGithub, FiTwitter } from 'react-icons/fi';
import { Logo } from '../Logo';
import { NavLink } from '../NavLink';
import { Button } from '../shared';

export const Hero = () => {
  return (
    <div className="flex items-center justify-between max-w-screen-xl px-4 pt-24 mx-auto md:pt-56 sm:px-6 md:px-8">
      <div className="flex-1">
        <div className="hidden lg:block">
          <Logo size={64} />
        </div>
        <h1 className="py-6 text-3xl font-bold sm:text-4xl lg:text-5xl">
          Build fully typesafe <br /> APIs easily.
        </h1>
        <p className="text-zinc-500 max-w-[80ch]">
          The client doesn&apos;t import any code from the server, only a single
          TypeScript type. The import type declaration is fully erased at
          runtime. tRPC transforms this type into a fully typesafe client.
        </p>
        <div className="flex items-center gap-6 pt-6">
          <Button href="/quickstart">Quickstart</Button>
          <Button href="/docs" variant="secondary">
            Read docs
          </Button>
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
      <div className="flex-1 hidden overflow-hidden shadow-lg rounded-xl lg:block">
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
