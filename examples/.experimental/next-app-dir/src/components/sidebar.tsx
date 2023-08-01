'use client';

import { Button } from '~/components/button';
import { cn } from '~/components/cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sideNav = [
  {
    name: 'Overview',
    href: '/',
  },
  {
    name: 'Server Components',
    href: '/rsc',
  },
  {
    name: 'Server Actions 1',
    href: '/server-action',
  },
  {
    name: 'Server Actions 2',
    href: '/alt-server-action',
  },
  {
    name: 'React Query',
    href: '/react-query',
  },
  {
    name: 'Full stack Invalidation',
    href: '/post-example',
  },
];

export function SideNav(props: { children: React.ReactNode }) {
  const page = usePathname();

  return (
    <div className="flex w-full flex-col sm:flex-row sm:py-6">
      <div className="order-first w-full flex-none sm:w-56">
        <div className="flex flex-row justify-between gap-x-4 gap-y-2 p-4 sm:flex-col sm:p-6">
          {sideNav.map((item) => (
            <Button
              asChild
              // disabled={item.disabled}
              variant="ghost"
              className="justify-start gap-2"
              key={item.href}
            >
              <Link
                href={item.href}
                className={cn(
                  page === item.href && 'bg-muted text-foreground/80',
                  // item.disabled && 'pointer-events-none opacity-50',
                )}
              >
                {item.name}
              </Link>
            </Button>
          ))}
        </div>
      </div>
      <div className="order-last min-h-screen w-screen p-4 pt-0 sm:w-full sm:p-6 sm:pt-6 md:order-none">
        {props.children}
      </div>
    </div>
  );
}
