import clsx from 'clsx';
import Link from 'next/link';
import { FC, ReactNode } from 'react';

interface NavLinkProps {
  href: string;
  children: ReactNode;
  external?: boolean;
}

const style =
  'text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200';

export const NavLink: FC<NavLinkProps> = ({
  href,
  children,
  external = false,
}) => (
  <li className="flex items-center">
    {external ? (
      <a
        href={href}
        className={clsx(style, 'text-xl')}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ) : (
      <Link href={href}>
        <a className={style}>{children}</a>
      </Link>
    )}
  </li>
);
