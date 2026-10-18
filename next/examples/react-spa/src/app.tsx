import { Badge } from '@shared/ui/components/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@shared/ui/components/empty';
import { Label } from '@shared/ui/components/label';
import { Switch } from '@shared/ui/components/switch';
import {
  onlineManager,
  useMutationState,
  useQuery,
} from '@tanstack/react-query';
import { MousePointerClickIcon } from 'lucide-react';
import { Suspense, useState } from 'react';
import { ActivityFeed } from './activity.tsx';
import { ErrorBoundary } from './error-boundary.tsx';
import { IssueDetail, IssueDetailSkeleton } from './issue-detail.tsx';
import { IssueList, NewIssue } from './issue-list.tsx';
import { useOnline } from './online.ts';
import { useTracker } from './trpc.tsx';

/** Counts pushed by the `stats` subscription, kept in the query cache. */
function Stats() {
  const trpc = useTracker();
  const stats = useQuery(trpc.stats.liveOptions());
  if (!stats.data) return <Badge variant="outline">Connecting…</Badge>;
  return (
    <div className="flex gap-1.5" aria-label="Stats">
      <Badge>{stats.data.open} open</Badge>
      <Badge variant="secondary">{stats.data.closed} closed</Badge>
      <Badge variant="outline">{stats.data.comments} comments</Badge>
    </div>
  );
}

/**
 * Takes TanStack's `onlineManager` offline, as a lost connection would:
 * mutations pause, and are persisted until it's back.
 */
function OfflineSwitch() {
  const trpc = useTracker();
  const online = useOnline();
  const queued = useMutationState({
    filters: trpc.issue.create.mutationFilter({ status: 'pending' }),
    select: (mutation) => mutation.state.isPaused,
  }).filter(Boolean).length;
  return (
    <div className="flex items-center gap-2">
      {queued > 0 && <Badge variant="destructive">{queued} queued</Badge>}
      <Switch
        id="offline"
        checked={!online}
        onCheckedChange={(offline) => onlineManager.setOnline(!offline)}
      />
      <Label htmlFor="offline">Offline</Label>
    </div>
  );
}

export function App() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-brand">tRPC</span> Issues
            </h1>
            <p className="text-sm text-muted-foreground">
              A Vite + React app on @trpc12/tanstack-react-query
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Stats />
            <OfflineSwitch />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="flex flex-col gap-4">
          <NewIssue />
          <IssueList
            selected={selected}
            onSelect={setSelected}
            onDeleted={(id) => setSelected((s) => (s === id ? null : s))}
          />
        </section>
        <section className="flex flex-col gap-4">
          {selected ? (
            <ErrorBoundary key={selected}>
              <Suspense fallback={<IssueDetailSkeleton />}>
                <IssueDetail id={selected} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <Empty className="border bg-background">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MousePointerClickIcon />
                </EmptyMedia>
                <EmptyTitle>No issue selected</EmptyTitle>
                <EmptyDescription>
                  Pick one to see its comments arrive live.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ActivityFeed />
        </section>
      </main>
    </div>
  );
}
