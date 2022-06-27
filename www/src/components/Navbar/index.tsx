import Link from 'next/link';
import { FaDiscord } from 'react-icons/fa';
import { FiGithub, FiTwitter } from 'react-icons/fi';
import { Logo } from '../Logo';
import { NavLink } from '../NavLink';

export const Navbar = () => (
  <div className="px-4 sm:px-6 md:px-8 py-6 max-w-screen-xl mx-auto">
    <nav className="flex items-center justify-between">
      <Link href="/">
        <a className="flex items-center gap-3">
          <Logo size={35} />
          <span>tRPC</span>
        </a>
      </Link>
      <ul className="flex gap-6 text-sm">
        <NavLink href="/docs">Docs</NavLink>
        <NavLink href="/quickstart">Quickstart</NavLink>
        <NavLink href="/examples">Examples</NavLink>
        <NavLink href="https://github.com/trpc/trpc" external>
          <FiGithub />
        </NavLink>
        {/* <NavLink href="https://twitter.com/alexdotjs" external>
          <FiTwitter />
        </NavLink>
        <NavLink href="https://discord.com/invite/wzaMgEJkcf" external>
          <FaDiscord />
        </NavLink> */}
      </ul>
    </nav>
  </div>
);
