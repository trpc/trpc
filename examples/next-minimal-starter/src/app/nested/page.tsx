import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import type { Metadata } from 'next';
import { parseMode } from './meter';
import { NestedDemo } from './nested-demo';

export const metadata: Metadata = {
  title: 'Nested queries · tRPC Next.js Minimal Starter',
};

/** The commit Vercel built, so the link shows the code that runs */
const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
const source = `https://github.com/trpc/trpc/blob/${sha ?? 'main'}/examples/next-minimal-starter/src`;
/** Without a commit, as when it runs locally, the links show `main` */
const onMain = sha ? '' : ' (on main)';

export default async function NestedPage(props: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { mode } = await props.searchParams;
  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-4 sm:gap-6 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Nested queries</h1>
          </CardTitle>
          <CardDescription>
            Posts, their authors and the authors&apos; teams, in one request
            with <code>experimental_nested()</code> and a plain{' '}
            <code>@trpc/client</code>. Each post shows at once; each author and
            team shows when its query is done. Switch to{' '}
            <em>Without pipelining</em> to see the requests it saves.{' '}
            <a
              className="underline"
              href={`${source}/app/nested/nested-demo.tsx`}
            >
              How it works{onMain}
            </a>{' '}
            ·{' '}
            <a className="underline" href={`${source}/trpc/routers/blog.ts`}>
              The router{onMain}
            </a>
          </CardDescription>
        </CardHeader>
      </Card>
      {/* Not in the card: its `overflow-hidden` would keep the live bar from sticking */}
      <NestedDemo initialMode={parseMode(mode)} />
    </main>
  );
}
