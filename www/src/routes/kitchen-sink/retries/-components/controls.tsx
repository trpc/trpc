import { Button } from '@shared/ui/components/button';
import { RotateCw } from 'lucide-react';
import { useId } from 'react';

import type { Plan } from '../-trpc.ts';

const commenters = ['ada', 'bob', 'cy'] as const;

/**
 * A number input's value as an integer within its bounds: the input's `min`
 * and `max` don't keep a typed value to them, and the server refuses one
 * outside its own
 */
function bounded(value: string, bounds: { min: number; max: number }) {
  return Math.min(
    bounds.max,
    Math.max(bounds.min, Math.trunc(Number(value) || 0)),
  );
}

function Times(props: {
  readonly label: string;
  readonly onChange: (times: number) => void;
  readonly value: number;
}) {
  const id = useId();
  return (
    <label className="flex items-center gap-2 text-xs" htmlFor={id}>
      <code className="font-mono">{props.label}</code>
      <span className="text-muted-foreground">fails</span>
      <input
        className="w-12 rounded-md border bg-background px-1.5 py-0.5 font-mono"
        id={id}
        max={5}
        min={0}
        onChange={(event) =>
          props.onChange(bounded(event.target.value, { min: 0, max: 5 }))
        }
        type="number"
        value={props.value}
      />
      <span className="text-muted-foreground">×</span>
    </label>
  );
}

/** How often each query fails, how `retryLink` retries, and a Load button */
export function Controls(props: {
  readonly onChange: (plan: Plan) => void;
  readonly onLoad: () => void;
  readonly plan: Plan;
}) {
  const { plan } = props;
  const set = (change: Partial<Plan>) => props.onChange({ ...plan, ...change });
  const ids = { commenter: useId(), noRetry: useId(), stream: useId() };
  return (
    <div className="grid gap-3 rounded-xl bg-card p-3 shadow-sm ring-1 ring-foreground/10">
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Times
          label="post.bySlug"
          onChange={(post) => set({ post })}
          value={plan.post}
        />
        <Times
          label="author.byId"
          onChange={(author) => set({ author })}
          value={plan.author}
        />
        <Times
          label="team.byId"
          onChange={(team) => set({ team })}
          value={plan.team}
        />
        <Times
          label="avatar.byId"
          onChange={(avatar) => set({ avatar })}
          value={plan.avatar}
        />
        <label
          className="flex items-center gap-2 text-xs"
          htmlFor={ids.commenter}
        >
          <code className="font-mono">user.byId</code>
          <span className="text-muted-foreground">fails once for</span>
          <select
            className="rounded-md border bg-background px-1.5 py-0.5 font-mono"
            id={ids.commenter}
            onChange={(event) =>
              set({
                commenter:
                  event.target.value === ''
                    ? null
                    : { id: event.target.value, times: 1 },
              })
            }
            value={plan.commenter?.id ?? ''}
          >
            <option value="">nobody</option>
            {commenters.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-xs">
        <label className="flex items-center gap-2" htmlFor={ids.noRetry}>
          <input
            checked={plan.retry === null}
            id={ids.noRetry}
            onChange={(event) =>
              set({
                retry: event.target.checked
                  ? null
                  : { attempts: 3, delayMs: 300 },
              })
            }
            type="checkbox"
          />
          No <code className="font-mono">retryLink</code>
        </label>
        {plan.retry ? (
          <>
            <label className="flex items-center gap-2">
              attempts
              <input
                className="w-12 rounded-md border bg-background px-1.5 py-0.5 font-mono"
                max={6}
                min={1}
                onChange={(event) =>
                  set({
                    retry: {
                      attempts: bounded(event.target.value, {
                        min: 1,
                        max: 6,
                      }),
                      delayMs: plan.retry?.delayMs ?? 0,
                    },
                  })
                }
                type="number"
                value={plan.retry.attempts}
              />
            </label>
            <label className="flex items-center gap-2">
              delay
              <input
                className="w-16 rounded-md border bg-background px-1.5 py-0.5 font-mono"
                max={3000}
                min={0}
                onChange={(event) =>
                  set({
                    retry: {
                      attempts: plan.retry?.attempts ?? 1,
                      delayMs: bounded(event.target.value, {
                        min: 0,
                        max: 3000,
                      }),
                    },
                  })
                }
                step={100}
                type="number"
                value={plan.retry.delayMs}
              />
              ms
            </label>
          </>
        ) : null}
        <label
          className="flex items-center gap-2"
          htmlFor={ids.stream}
          title="Chrome's Network tab shows no body for a streamed response"
        >
          <input
            checked={plan.stream}
            id={ids.stream}
            onChange={(event) => set({ stream: event.target.checked })}
            type="checkbox"
          />
          Stream (<code className="font-mono">httpBatchStreamLink</code>)
        </label>
        <Button className="ml-auto" onClick={props.onLoad} size="sm">
          <RotateCw />
          Load
        </Button>
      </div>
    </div>
  );
}
