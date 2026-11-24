import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { pageHead } from '~/seo.ts';

import { Note, SeeItYourself } from '../-components/note.tsx';
import { showcases } from '../-showcases.ts';
import { showcaseFileUrl } from '../-source.ts';
import { Controls } from './-components/controls.tsx';
import { LoadLog } from './-components/log.tsx';
import { Results } from './-components/results.tsx';
import {
  createLog,
  type Loaded,
  loadRetries,
  type Log,
  type Plan,
} from './-trpc.ts';

const [, , , showcase] = showcases;

export const Route = createFileRoute('/kitchen-sink/retries/')({
  head: () => pageHead({ ...showcase, noindex: true }),
  component: RetriesPage,
});

/** Fails the author once and one commenter once, so the first load retries */
const firstPlan: Plan = {
  author: 1,
  avatar: 0,
  commenter: { id: 'bob', times: 1 },
  post: 0,
  retry: { attempts: 3, delayMs: 300 },
  team: 0,
};

function RetriesPage() {
  const [plan, setPlan] = useState(firstPlan);
  /** Bumped by the Load button */
  const [loads, setLoads] = useState(0);
  // Set once mounted, in the browser: the server renders no load
  const [run, setRun] = useState<{
    readonly id: number;
    readonly loaded: Loaded;
    readonly log: Log;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const log = createLog();
    // A new session for each load: the server counts each query's runs by it
    const loaded = loadRetries({
      fetch: (url, init) => fetch(url, init),
      log,
      plan,
      session: crypto.randomUUID(),
      signal: controller.signal,
    });
    setRun((last) => ({ id: (last?.id ?? 0) + 1, loaded, log }));
    return () => controller.abort();
    // Only the Load button loads: changing a control doesn't
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loads]);

  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight">
        {showcase.title}
      </h1>
      <p className="text-muted-foreground">
        A post, its author and the author's team, and a commenter with an avatar
        for each comment: one pipelined request with{' '}
        <code>experimental_load()</code>. Each query is an operation of its own
        through the links, so <code>retryLink</code> retries the one that
        failed, and the queries that read it go in its retry's request. What it
        read isn't sent again.{' '}
        <a className="underline" href={showcaseFileUrl(showcase, '-trpc.ts')}>
          How it works
        </a>{' '}
        ·{' '}
        <a
          className="underline"
          href={showcaseFileUrl(showcase, '-server/router.ts')}
        >
          The router
        </a>
      </p>
      <SeeItYourself>
        <p>
          The first load fails <code>author.byId</code> once, and{' '}
          <code>user.byId</code> once for bob. Request 1 carries every query.
          The retries carry only <code>author.byId</code> with{' '}
          <code>team.byId</code>, which reads it, and bob's{' '}
          <code>user.byId</code> with his <code>avatar.byId</code>: in one
          request if their delays end together. The post says <em>run 1</em>: it
          never ran again.
        </p>
        <p>
          Then tick <em>No retryLink</em> and load again: the author and the
          team fail with the author's error, and nothing is sent again. Or set a
          query to fail more times than there are attempts.
        </p>
      </SeeItYourself>
      <Controls
        onChange={setPlan}
        onLoad={() => setLoads((count) => count + 1)}
        plan={plan}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-2">
          <h2 className="text-lg font-semibold">Queries</h2>
          <Note label="run · the server's count">
            The server counts each query's runs in the load. <em>run 2</em>{' '}
            means it failed once and a retry answered.
          </Note>
          {run ? <Results key={run.id} loaded={run.loaded} /> : null}
        </section>
        <section className="grid content-start gap-2">
          <h2 className="text-lg font-semibold">What was sent</h2>
          <Note label="retryLink · per query">
            A commenter's query fails inside the request of its list. It comes
            back as an operation of its own, and <code>retryLink</code> counts
            that failure as its first attempt.
          </Note>
          <LoadLog key={run?.id ?? 0} log={run?.log ?? null} />
        </section>
      </div>
    </>
  );
}
