import Link from 'next/link';
import { FaDiscord } from 'react-icons/fa';
import { FiGithub, FiTwitter } from 'react-icons/fi';
import { Logo } from '../Logo';
import { NavLink } from '../NavLink';

export const Navbar = () => (
  <div className="px-4 py-6 mx-auto max-w-screen-xl sm:px-6 md:px-8">
    <nav className="flex justify-between items-center">
      <Link href="/">
        <a className="flex gap-3 items-center">
          <Logo size={35} />
          <span>tRPC</span>
        </a>
      </Link>
      <div className="flex gap-6">
        <ul className="flex gap-6 text-sm">
          <NavLink href="/docs">Docs</NavLink>
          <NavLink href="/quickstart">Quickstart</NavLink>
          <NavLink href="/examples">Examples</NavLink>
        </ul>
        <ul className="hidden gap-6 md:flex">
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
    </nav>
  </div>
);
