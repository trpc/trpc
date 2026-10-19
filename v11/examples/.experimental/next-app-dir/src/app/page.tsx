import { auth } from '~/auth';
import Link from 'next/link';

export default async function Index() {
  const session = await auth();

  return (
    <>
      <Link
        href={session ? '/api/auth/signout' : '/api/auth/signin'}
        style={{
          backgroundColor: '#0077cc', // Green
          border: 'none',
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          textAlign: 'center',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        {session ? 'Sign out' : 'Sign in'}
      </Link>

      <h3>Showcase Pages</h3>
      <ul
        style={{
          listStyle: 'disc',
          listStylePosition: 'inside',
          padding: 0,
        }}
      >
        <li>
          <Link
            href="/posts"
            style={{
              color: 'hsla(210, 16%, 80%, 1)',
            }}
          >
            Server Adapter{' '}
            <em>
              (only using <code>@trpc/server</code> &amp; no other{' '}
              <code>@trpc/*</code>-packages)
            </em>
          </Link>
        </li>
        <li>
          <Link
            href="/rsc-rq-prefetch"
            style={{
              color: 'hsla(210, 16%, 80%, 1)',
            }}
          >
            RSC React Query prefetching
          </Link>
        </li>
        <li>
          <Link
            href="/rsc-links"
            style={{
              color: 'hsla(210, 16%, 80%, 1)',
            }}
          >
            React Server Components with new tRPC Next.js Links
          </Link>
        </li>
        <li>
          <Link
            href="/rsc-rq-prefetch"
            style={{
              color: 'hsla(210, 16%, 80%, 1)',
            }}
          >
            RSC + React Query
          </Link>
        </li>
        <li>
          <Link
            href="/client"
            style={{
              color: 'hsla(210, 16%, 80%, 1)',
            }}
          >
            Client Side Data Fetching
          </Link>
        </li>
        <li>
          <Link
            href="/server-action"
            style={{
              color: 'hsla(210, 16%, 80%, 1)',
            }}
          >
            Server Action
          </Link>
        </li>

        <li>
          <Link
            href="/post-example"
            style={{
              color: 'hsla(210, 16%, 80%, 1)',
            }}
          >
            Full stack Post Example
          </Link>
        </li>
      </ul>
    </>
  );
}
