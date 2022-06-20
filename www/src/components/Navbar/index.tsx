import Image from 'next/image';
import Link from 'next/link';
import { FaDiscord } from 'react-icons/fa';
import { FiGithub, FiTwitter } from 'react-icons/fi';
import { NavLink } from '../NavLink';

export const Navbar = () => (
  <nav className="flex items-center justify-between">
    <Link href="/">
      <a className="flex items-center gap-3">
        <Image src="/logo.svg" alt="logo" width={35} height={35} />
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
      <NavLink href="https://twitter.com/alexdotjs" external>
        <FiTwitter />
      </NavLink>
      <NavLink href="https://discord.com/invite/wzaMgEJkcf" external>
        <FaDiscord />
      </NavLink>
    </ul>
  </nav>
);
