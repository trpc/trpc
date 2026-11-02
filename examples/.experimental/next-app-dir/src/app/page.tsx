import { buttonVariants } from '@shared/ui/components/button';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import {
  ChevronRightIcon,
  DatabaseZapIcon,
  FileTextIcon,
  LayersIcon,
  LogInIcon,
  LogOutIcon,
  MonitorIcon,
  ServerIcon,
  ZapIcon,
} from 'lucide-react';
import Link from 'next/link';
import { auth } from '~/auth';
import {
  Badge,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from './_components/client-ui';

const showcase = [
  {
    href: '/posts',
    icon: ServerIcon,
    title: 'Server Adapter',
    description: (
      <>
        Server functions with only <code>@trpc/server</code>, and no other{' '}
        <code>@trpc/*</code> packages
      </>
    ),
  },
  {
    href: '/rsc-rq-prefetch',
    icon: LayersIcon,
    title: 'RSC + React Query',
    description:
      'Prefetch in a Server Component, then read and invalidate the query on the client',
  },
  {
    href: '/rsc-links',
    icon: DatabaseZapIcon,
    title: "Server Components with tRPC's Next.js links",
    description:
      'Call procedures from Server Components, cache them, and revalidate the cache',
  },
  {
    href: '/client',
    icon: MonitorIcon,
    title: 'Client-side data fetching',
    description: 'Fetch from a Client Component',
    badge: 'Not implemented',
  },
  {
    href: '/server-action',
    icon: ZapIcon,
    title: 'Server Actions',
    description: (
      <>
        Procedures as Server Actions, with <code>useAction</code> and forms
      </>
    ),
  },
  {
    href: '/post-example',
    icon: FileTextIcon,
    title: 'Full-stack post example',
    description:
      'Read in a Server Component, write with a Server Action, then revalidate',
  },
];

export default async function Index() {
  const session = await auth();
  const userName = session?.user?.name;

  return (
    <>
      <section className="flex flex-col items-start gap-4">
        <Badge variant="secondary">Experimental</Badge>
        <h1 className="text-4xl font-bold tracking-tight">
          tRPC in the Next.js App Router
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Server Components, Server Actions and React Query with tRPC&apos;s
          experimental App Router APIs. Each page shows one way to use them.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            {userName ? `Signed in as ${userName}` : 'Session'}
          </CardTitle>
          <CardDescription>
            {userName ? (
              <>
                Procedures like <code>secret</code> now see your session.
              </>
            ) : (
              <>
                Sign in to see authenticated procedures like <code>secret</code>{' '}
                on the Server Components page.
              </>
            )}
          </CardDescription>
          <CardAction>
            {session ? (
              <a
                href="/api/auth/signout"
                className={buttonVariants({ variant: 'outline' })}
              >
                <LogOutIcon />
                Sign out
              </a>
            ) : (
              <a href="/api/auth/signin" className={buttonVariants()}>
                <LogInIcon />
                Sign in
              </a>
            )}
          </CardAction>
        </CardHeader>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Showcase pages
        </h2>
        <ItemGroup className="grid gap-3 sm:grid-cols-2">
          {showcase.map((page) => (
            <Item
              key={page.href}
              variant="outline"
              className="bg-background"
              render={<Link href={page.href} />}
            >
              <ItemMedia variant="icon">
                <page.icon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {page.title}
                  {page.badge && <Badge variant="outline">{page.badge}</Badge>}
                </ItemTitle>
                <ItemDescription>{page.description}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </section>
    </>
  );
}
