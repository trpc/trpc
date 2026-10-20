import { Button } from '@shared/ui/components/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@shared/ui/components/native-select';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@shared/ui/components/resizable';
import { cn } from '@shared/ui/lib/utils';
import { type AnyRouter, createMemoryHistory } from '@tanstack/react-router';
import { RotateCcw, Unplug, WifiOff } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { buildDemo, type DemoApp } from './app.ts';
import { DemoBrowser, DemoRequests } from './browser.tsx';
import type { DemoDefinition } from './define.ts';
import { demos } from './demos.ts';
import { CodeEditor, type EditorTypes } from './editor.tsx';
import { DemoModuleError, type DemoFile } from './modules.ts';
import { createNetwork, type DemoNetwork, latencies } from './network.ts';
import type { TypeDiagnostic } from './ts-service.ts';
import {
  startedTypeChecker,
  type TypeChecker,
  typeCheckerFor,
} from './type-check.ts';

/** How long typing pauses before the app rebuilds. */
const rebuildAfterMs = 500;

/** How long typing pauses before the types are checked again. */
const recheckAfterMs = 250;

/**
 * The reader's edits, by demo, for as long as the page is open: the frame
 * moves between the page's column and its side at the `xl` breakpoint, and
 * keeps them across the move.
 */
const edits = new Map<string, ReadonlyArray<DemoFile>>();

interface Session {
  readonly app: DemoApp;
  readonly network: DemoNetwork;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds `files` whenever they change (after a pause in typing), and keeps
 * the last build that worked running while a newer one doesn't.
 */
function useBuild(demo: DemoDefinition, files: ReadonlyArray<DemoFile>) {
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState<unknown>();
  const [building, setBuilding] = useState(true);
  useEffect(() => {
    let current = true;
    setBuilding(true);
    const timer = setTimeout(
      () => {
        buildDemo(demo, files).then(
          (app) => {
            if (current) {
              setSession({ app, network: createNetwork(app.server) });
              setError(undefined);
              setBuilding(false);
            }
          },
          (cause: unknown) => {
            if (current) {
              setError(cause);
              setBuilding(false);
            }
          },
        );
      },
      session ? rebuildAfterMs : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // A build starts for new files only; `session` only picks the delay.
  }, [demo, files]);
  return { building, error, session };
}

interface Checked {
  readonly diagnostics: Readonly<Record<string, ReadonlyArray<TypeDiagnostic>>>;
  readonly files: ReadonlyArray<DemoFile>;
}

/**
 * Checks `files`' types whenever they change (after a pause in typing),
 * once `checker` has started. The app runs whatever they say, as with
 * Vite's dev server.
 */
function useTypeErrors(
  checker: TypeChecker | undefined,
  files: ReadonlyArray<DemoFile>,
) {
  const [checked, setChecked] = useState<Checked>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!checker) {
      return undefined;
    }
    let current = true;
    const timer = setTimeout(
      () => {
        checker.check(files).then(
          (diagnostics) => {
            if (current) {
              setChecked({ diagnostics, files });
              setFailed(false);
            }
          },
          () => {
            if (current) {
              setFailed(true);
            }
          },
        );
      },
      checked ? recheckAfterMs : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // A check starts for new files only; `checked` only picks the delay.
  }, [checker, files]);
  const errors = checked
    ? Object.values(checked.diagnostics).reduce(
        (sum, each) => sum + each.length,
        0,
      )
    : 0;
  const status = !checker
    ? undefined
    : failed
      ? 'Types unavailable'
      : !checked
        ? 'Loading TypeScript…'
        : checked.files !== files
          ? 'Checking types…'
          : errors === 0
            ? 'No type errors'
            : `${String(errors)} type error${errors === 1 ? '' : 's'}`;
  return { checked, errors, status };
}

/** `checker`'s answers for the file in the editor, with its code as typed. */
function editorTypes(
  checker: TypeChecker,
  files: { readonly current: ReadonlyArray<DemoFile> },
): EditorTypes {
  const withCode = (name: string, code: string) =>
    files.current.map((file) => (file.name === name ? { code, name } : file));
  return {
    completions: (name, code, position) =>
      checker.completions(withCode(name, code), name, position),
    quickInfo: (name, code, position) =>
      checker.quickInfo(withCode(name, code), name, position),
  };
}

/**
 * One browser running the demo's app, for `user` when the demo has users.
 * A new build or a reload restarts its app where it was.
 */
function AppBrowser(props: {
  readonly demo: DemoDefinition;
  readonly session: Session;
  readonly user: string | undefined;
}) {
  const session = props.session;
  const user = props.user;
  const [reloads, setReloads] = useState(0);
  const [path, setPath] = useState(props.demo.start);
  const router = useMemo<AnyRouter>(
    () =>
      session.app.getRouter({
        fetch:
          user === undefined
            ? session.network.fetch
            : session.network.fetchAs(user),
        history: createMemoryHistory({ initialEntries: [path] }),
        user,
      }),
    // `path` follows the app between restarts.
    [session, user, reloads],
  );
  useEffect(
    () =>
      router.history.subscribe(() => {
        setPath(router.history.location.href);
      }),
    [router],
  );
  return (
    <DemoBrowser
      key={reloads}
      onReload={() => setReloads((count) => count + 1)}
      router={router}
      user={user}
    />
  );
}

/**
 * A demo, live: its code in an editor, its app in a browser, and the
 * requests between the app and its tRPC server.
 */
export function DemoFrame(props: {
  readonly className?: string | undefined;
  readonly demo: DemoDefinition;
}) {
  const demo = props.demo;
  const [files, setFiles] = useState(() => edits.get(demo.id) ?? demo.files);
  const [file, setFile] = useState(demo.open);
  const [resets, setResets] = useState(0);
  const [latency, setLatency] = useState<number>(latencies[1].ms);
  const build = useBuild(demo, files);
  const session = build.session;
  const error = build.error;
  const sample = demos[demo.id].sample;
  const [checker, setChecker] = useState(() => startedTypeChecker(sample));
  const types = useTypeErrors(checker, files);
  const latestFiles = useRef(files);
  latestFiles.current = files;
  const forEditor = useMemo(
    () => (checker ? editorTypes(checker, latestFiles) : undefined),
    [checker],
  );
  const checked = types.checked;
  const fileDiagnostics = useMemo(
    () =>
      checked && {
        code: checked.files.find((each) => each.name === file)?.code ?? '',
        diagnostics: checked.diagnostics[file] ?? [],
      },
    [checked, file],
  );

  useEffect(() => {
    if (session) {
      session.network.latency = latency;
    }
  }, [latency, session]);

  const failures = useFailures(session?.network);
  const connections = useConnections(session?.network);
  const edited = files !== demo.files;
  const failed =
    error instanceof DemoModuleError && error.file === file
      ? error.line
      : undefined;

  const change = (name: string, code: string) => {
    setFiles((previous) => {
      const next = previous.map((each) =>
        each.name === name ? { ...each, code } : each,
      );
      edits.set(demo.id, next);
      return next;
    });
  };

  return (
    <div
      className={cn(
        'not-prose flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm',
        props.className,
      )}
      data-demo-frame={demo.id}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <p className="mr-auto text-sm font-semibold">{demos[demo.id].title}</p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Network
          <NativeSelect
            onChange={(event) => setLatency(Number(event.target.value))}
            size="sm"
            value={latency}
          >
            {latencies.map((option) => (
              <NativeSelectOption key={option.label} value={option.ms}>
                {option.label} ({option.ms} ms)
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <Button
          disabled={!session}
          onClick={() => session?.network.failNext()}
          size="sm"
          variant={failures > 0 ? 'destructive' : 'outline'}
        >
          <Unplug />
          {failures > 0 ? 'Next request fails' : 'Fail next request'}
        </Button>
        {connections.seen ? (
          <Button
            disabled={connections.open === 0}
            onClick={() => session?.network.dropConnections()}
            size="sm"
            variant="outline"
          >
            <WifiOff />
            Drop connections
          </Button>
        ) : null}
        <Button
          disabled={!edited}
          onClick={() => {
            edits.delete(demo.id);
            setFiles(demo.files);
            setResets((count) => count + 1);
          }}
          size="sm"
          variant="outline"
        >
          <RotateCcw />
          Reset code
        </Button>
      </div>
      <p className="border-b bg-muted/30 px-3 py-1.5 text-xs text-pretty text-muted-foreground">
        {demo.hint}
      </p>
      <ResizablePanelGroup className="min-h-0 flex-1" orientation="vertical">
        <ResizablePanel defaultSize="42" minSize={120}>
          <div className="relative h-full">
            {session && demo.users ? (
              <ResizablePanelGroup orientation="horizontal">
                {demo.users.map((user, index) => (
                  <Fragment key={user}>
                    {index > 0 ? <ResizableHandle withHandle /> : null}
                    <ResizablePanel minSize={160}>
                      <AppBrowser demo={demo} session={session} user={user} />
                    </ResizablePanel>
                  </Fragment>
                ))}
              </ResizablePanelGroup>
            ) : session ? (
              <AppBrowser demo={demo} session={session} user={undefined} />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {error
                  ? 'The demo didn’t build: fix the error under the code, or reset it.'
                  : 'Starting the demo…'}
              </p>
            )}
            {error && session ? (
              <div className="absolute inset-x-2 bottom-2 rounded-md border border-destructive/40 bg-background/95 p-2 text-xs text-destructive shadow-sm">
                Still running the last build that worked.
              </div>
            ) : null}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="16" minSize={60}>
          {session ? <DemoRequests network={session.network} /> : null}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="42" minSize={120}>
          <div className="flex h-full min-h-0 flex-col">
            <div
              aria-label="Files"
              className="flex shrink-0 gap-0.5 overflow-x-auto border-b bg-muted/40 px-1.5 pt-1.5"
              role="tablist"
            >
              {files.map((each) => {
                const typeErrors =
                  types.checked?.diagnostics[each.name]?.length ?? 0;
                return (
                  <button
                    aria-selected={each.name === file}
                    className={cn(
                      'shrink-0 rounded-t-md border border-b-0 px-2.5 py-1 font-mono text-xs',
                      each.name === file
                        ? 'border-border bg-card text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                      ((error instanceof DemoModuleError &&
                        error.file === each.name) ||
                        typeErrors > 0) &&
                        'text-destructive',
                    )}
                    data-type-errors={types.checked ? typeErrors : undefined}
                    key={each.name}
                    onClick={() => setFile(each.name)}
                    role="tab"
                    title={
                      typeErrors > 0
                        ? `${String(typeErrors)} type error${typeErrors === 1 ? '' : 's'}`
                        : undefined
                    }
                    type="button"
                  >
                    {each.name}
                    {each.code ===
                    demo.files.find((original) => original.name === each.name)
                      ?.code
                      ? ''
                      : ' •'}
                    {typeErrors > 0 ? (
                      <span className="ml-1 rounded-full bg-destructive/15 px-1.5 tabular-nums">
                        {typeErrors}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <span
                className={cn(
                  'ml-auto shrink-0 self-center px-2 text-xs text-muted-foreground',
                  !build.building && types.status === undefined && 'invisible',
                  !build.building && types.errors > 0 && 'text-destructive',
                )}
                data-type-status
              >
                {build.building ? 'Building…' : (types.status ?? 'Building…')}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor
                diagnostics={fileDiagnostics}
                errorLine={failed}
                file={file}
                files={files}
                onChange={change}
                onFocus={() => {
                  if (!checker) {
                    setChecker(typeCheckerFor(sample));
                  }
                }}
                types={forEditor}
                version={resets}
              />
            </div>
            {error ? (
              <pre
                className="max-h-32 shrink-0 overflow-auto border-t bg-destructive/10 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-destructive"
                role="alert"
              >
                {error instanceof DemoModuleError && error.file
                  ? `${error.file}${error.line === undefined ? '' : `:${String(error.line)}`}: `
                  : ''}
                {errorMessage(error)}
              </pre>
            ) : null}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function useFailures(network: DemoNetwork | undefined) {
  const [failures, setFailures] = useState(0);
  useEffect(() => {
    if (!network) {
      return undefined;
    }
    setFailures(network.failures);
    return network.subscribe(() => setFailures(network.failures));
  }, [network]);
  return failures;
}

/**
 * The network's open subscriptions, and whether the demo has opened one:
 * its toolbar offers to drop them from then on, reconnects included.
 */
function useConnections(network: DemoNetwork | undefined) {
  const [open, setOpen] = useState(0);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!network) {
      return undefined;
    }
    const read = () => {
      setOpen(network.connections);
      if (network.connections > 0) {
        setSeen(true);
      }
    };
    read();
    return network.subscribe(read);
  }, [network]);
  return { open, seen };
}
