import { type ChildProcess, fork } from 'node:child_process';
import { availableParallelism } from 'node:os';

import { Effect } from 'effect';

import { ContentError } from './content-error.ts';
import type { RenderedMarkdown, RenderOptions } from './markdown.ts';
import type { TwoslashCacheOptions } from './twoslash-cache.ts';

export interface RenderRequest {
  readonly id: number;
  readonly markdown: string;
  readonly options: Omit<RenderOptions, 'twoslashCache'>;
  readonly twoslashCache?: TwoslashCacheOptions | undefined;
}

export interface RenderStats {
  readonly hits: number;
  readonly misses: number;
}

export type RenderReply =
  | {
      readonly id: number;
      readonly rendered: RenderedMarkdown;
      readonly stats: RenderStats;
    }
  | {
      readonly error: string;
      readonly id: number;
      readonly stats: RenderStats;
    };

export interface RenderPool {
  /** {@link renderMarkdown} in another process, with the cache `twoslashCache` makes. */
  readonly render: (
    markdown: string,
    options: Omit<RenderOptions, 'twoslashCache'>,
    twoslashCache: TwoslashCacheOptions | undefined,
  ) => Effect.Effect<
    { readonly rendered: RenderedMarkdown; readonly stats: RenderStats },
    ContentError
  >;
  /** Ends the processes; a later render starts them again. */
  readonly close: () => Promise<void>;
}

/**
 * A render process's heap. Its TypeScript environments are most of it (2 at
 * 100–250 MB, `liveEnvironments` in `markdown.ts`); at the build's 4 GB each
 * heap grew past 2 GB before collecting, and three of them with the build
 * outgrew the build machine (8 GB). Worker threads can't have their own:
 * `NODE_OPTIONS`' `--max-old-space-size` overrides a thread's
 * `resourceLimits`.
 */
const heapMb = 1280;

/** The sample apps a page compiles in, so a process gets the pages whose TypeScript environments it has. */
function appsOf(
  markdown: string,
  options: Omit<RenderOptions, 'twoslashCache'>,
) {
  if (!markdown.includes('twoslash')) {
    return '';
  }
  const apps = new Set(
    Array.from(
      markdown.matchAll(/^\/\/ @filename: ([^/\n]+)\//gm),
      (match) => match[1],
    ),
  );
  return [
    options.inlineApp ?? '',
    ...[...apps].toSorted((a = '', b = '') => a.localeCompare(b)),
  ].join(' ');
}

interface Task {
  readonly apps: string;
  readonly request: RenderRequest;
  readonly done: (reply: RenderReply) => void;
  /** Whether a process already died rendering it. */
  retried?: boolean;
}

interface Renderer {
  readonly child: ChildProcess;
  apps?: string | undefined;
  task?: Task | undefined;
}

/**
 * Renders pages in child processes, one per core but the one the build runs
 * on, as compiling a cold cache's Twoslash blocks is most of a build and
 * runs on one thread. Each process keeps its own TypeScript environments, so
 * it's sent the pages of the apps it compiled last when there are any. A
 * process that dies (out of memory) is replaced, and its page tried once
 * more.
 */
export function makeRenderPool(
  size = Math.max(1, availableParallelism() - 1),
): RenderPool {
  const queue: Array<Task> = [];
  const renderers = new Set<Renderer>();
  let nextId = 0;

  const start = () => {
    const child = fork(new URL('render-worker.ts', import.meta.url), {
      env: {
        ...process.env,
        NODE_OPTIONS: process.env['NODE_OPTIONS']?.replaceAll(
          /--max-old-space-size=\S*/g,
          '',
        ),
      },
      execArgv: [`--max-old-space-size=${heapMb}`],
      serialization: 'advanced',
    });
    const renderer: Renderer = { child };
    child.on('message', (reply: RenderReply) => {
      const task = renderer.task;
      renderer.task = undefined;
      // Before `done`, which can start the page's next render at once:
      // that one queues, rather than finding this process idle.
      next(renderer);
      task?.done(reply);
    });
    child.on('exit', (code, signal) => {
      renderers.delete(renderer);
      const task = renderer.task;
      renderer.task = undefined;
      if (task && !task.retried) {
        task.retried = true;
        queue.unshift(task);
      } else {
        task?.done({
          error: `a render process exited (${signal ?? `code ${String(code)}`})`,
          id: task.request.id,
          stats: { hits: 0, misses: 0 },
        });
      }
      fill();
    });
    renderers.add(renderer);
    return renderer;
  };

  // An idle process doesn't keep the build alive, so one that fails before
  // `close` still exits.
  const next = (renderer: Renderer) => {
    if (renderer.task) {
      return;
    }
    const same = queue.findIndex((task) => task.apps === renderer.apps);
    const [task] = queue.splice(same === -1 ? 0 : same, 1);
    if (!task) {
      renderer.child.unref();
      renderer.child.channel?.unref();
      return;
    }
    renderer.apps = task.apps;
    renderer.task = task;
    renderer.child.ref();
    renderer.child.channel?.ref();
    renderer.child.send(task.request);
  };

  const fill = () => {
    for (const renderer of renderers) {
      if (!renderer.task) {
        next(renderer);
      }
    }
    while (queue.length > 0 && renderers.size < size) {
      next(start());
    }
  };

  return {
    close: async () => {
      const ending = [...renderers].map(
        (renderer) =>
          new Promise<void>((resolve) => {
            renderer.child.removeAllListeners('exit');
            if (
              renderer.child.exitCode !== null ||
              renderer.child.signalCode !== null
            ) {
              resolve();
              return;
            }
            renderer.child.once('exit', () => resolve());
            renderer.child.kill();
          }),
      );
      renderers.clear();
      await Promise.all(ending);
    },
    render: (markdown, options, twoslashCache) =>
      Effect.flatMap(
        Effect.callback<RenderReply>((resume) => {
          nextId += 1;
          queue.push({
            apps: appsOf(markdown, options),
            done: (reply) => resume(Effect.succeed(reply)),
            request: { id: nextId, markdown, options, twoslashCache },
          });
          fill();
        }),
        (reply) =>
          'error' in reply
            ? Effect.fail(new ContentError({ message: reply.error }))
            : Effect.succeed({ rendered: reply.rendered, stats: reply.stats }),
      ),
  };
}
