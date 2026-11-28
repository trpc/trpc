import { useSyncExternalStore } from 'react';

import type { Attempt, Log, LogState, SentRequest } from '../-trpc.ts';

const empty: LogState = { attempts: [], requests: [] };

/** What each request after the first carried, and what it didn't */
function summaryOf(requests: ReadonlyArray<SentRequest>) {
  const [first, ...retries] = requests;
  if (!first) {
    return [];
  }
  const firstPaths = new Set(first.calls.map((call) => call.path));
  return retries.map((request, index) => {
    const carried = Array.from(new Set(request.calls.map((call) => call.path)));
    const skipped = Array.from(firstPaths).filter(
      (path) => !carried.includes(path),
    );
    return { carried, number: index + 2, skipped };
  });
}

function Outcome(props: { readonly attempt: Attempt }) {
  switch (props.attempt.outcome) {
    case 'pending':
      return <span className="text-muted-foreground">…</span>;
    case 'ok':
      return <span>✅</span>;
    case 'error':
      return (
        <span className="text-destructive" title={props.attempt.error ?? ''}>
          ❌
        </span>
      );
  }
}

/** The requests a load sent, and each attempt of each query */
export function LoadLog(props: { readonly log: Log | null }) {
  const state = useSyncExternalStore(
    (listener) => props.log?.subscribe(listener) ?? (() => undefined),
    () => props.log?.get() ?? empty,
    () => empty,
  );
  const summary = summaryOf(state.requests);
  return (
    <div className="grid gap-4">
      {summary.length > 0 ? (
        <ul className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {summary.map((line) => (
            <li key={line.number}>
              <span className="font-medium">Request {line.number}</span> carried
              only{' '}
              {line.carried.map((path, index) => (
                <span key={path}>
                  {index > 0 ? ' + ' : ''}
                  <code className="font-mono">{path}</code>
                </span>
              ))}
              {line.skipped.length > 0 ? (
                <span className="text-muted-foreground">
                  {' '}
                  — not {line.skipped.join(', ')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">HTTP requests</h3>
        {state.requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ol className="grid gap-2">
            {state.requests.map((request, index) => (
              <li
                className="grid gap-1 rounded-lg bg-card p-3 text-sm shadow-sm ring-1 ring-foreground/10 motion-safe:animate-arrive"
                // Requests are only ever added
                key={index}
              >
                <span className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Request {index + 1}
                  </span>
                  <span className="font-mono">
                    {request.ms} ms
                    {request.doneMs === null
                      ? ' · streaming…'
                      : ` → ${request.doneMs} ms`}
                  </span>
                </span>
                <ul className="flex flex-wrap gap-1.5">
                  {request.calls.map((call, at) => (
                    <li
                      className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px]"
                      key={at}
                    >
                      {call.path}{' '}
                      <span className="text-muted-foreground">
                        ({call.label})
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">
          Attempts, as a link after <code className="font-mono">retryLink</code>{' '}
          sees them
        </h3>
        {state.attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">ms</th>
                <th className="py-1 font-medium">op</th>
                <th className="py-1 font-medium">query</th>
                <th className="py-1 font-medium">for</th>
                <th className="py-1 font-medium">attempt</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody className="font-mono">
              {state.attempts.map((attempt, index) => (
                <tr
                  className={
                    attempt.attempt > 1 ? 'bg-amber-500/10' : undefined
                  }
                  key={index}
                >
                  <td className="py-0.5">{attempt.ms}</td>
                  <td className="py-0.5">#{attempt.id}</td>
                  <td className="py-0.5">{attempt.path}</td>
                  <td className="py-0.5 text-muted-foreground">
                    {attempt.label}
                  </td>
                  <td className="py-0.5">{attempt.attempt}</td>
                  <td className="py-0.5">
                    <Outcome attempt={attempt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
