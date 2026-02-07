import { spawn } from 'child_process';
import { observable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import type { TRPCLink } from './links/types';
import { TRPCClientError } from './TRPCClientError';

export interface IpcLinkOptions {
  /**
   * The command to spawn the child process (e.g. path to the C++ engine binary).
   */
  command: string;
  /**
   * Arguments passed to the spawned command.
   * @default []
   */
  args?: string[];
  /**
   * Environment variables for the child process.
   * Inherits from `process.env` by default.
   */
  env?: Record<string, string>;
}

/**
 * ipcLink is a terminating link that communicates with a local child process
 * via stdin/stdout instead of HTTP. Designed for desktop apps where a tRPC
 * client (admin shell) talks to a local C++ back-end engine.
 *
 * Protocol:
 * 1. Spawns the child process with the configured command/args.
 * 2. Writes the JSON-serialized operation to the child's stdin.
 * 3. Reads the JSON response from the child's stdout.
 * 4. Handles stderr, non-zero exit codes, and spawn errors.
 */
export function ipcLink<TRouter extends AnyRouter>(
  opts: IpcLinkOptions,
): TRPCLink<TRouter> {
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        const { id, type, path, input } = op;

        if (type === 'subscription') {
          throw new Error(
            'Subscriptions are unsupported by `ipcLink` — use `wsLink` instead',
          );
        }

        const payload = JSON.stringify({ id, type, path, input });

        const child = spawn(opts.command, opts.args ?? [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: opts.env ?? process.env,
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        // Wire AbortSignal to kill the child process on cancellation
        const onAbort = () => {
          if (!settled) {
            child.kill();
          }
        };
        op.signal?.addEventListener('abort', onAbort, { once: true });

        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        child.on('error', (err) => {
          if (settled) return;
          settled = true;
          observer.error(
            TRPCClientError.from(err, {
              meta: { stderr },
            }),
          );
        });

        child.on('close', (code) => {
          if (settled) return;
          settled = true;

          if (code !== 0) {
            observer.error(
              TRPCClientError.from(
                new Error(
                  `ipcLink: child process exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`,
                ),
              ),
            );
            return;
          }

          try {
            const json = JSON.parse(stdout);
            observer.next({
              result: { type: 'data', data: json },
            });
            observer.complete();
          } catch (cause) {
            observer.error(
              TRPCClientError.from(
                new Error(
                  `ipcLink: failed to parse child stdout as JSON: ${stdout.slice(0, 200)}`,
                ),
              ),
            );
          }
        });

        // Task 1: Write the JSON payload to the child's stdin
        child.stdin.write(payload);
        child.stdin.end();

        // Cleanup: kill the child process if the observable is unsubscribed
        return () => {
          op.signal?.removeEventListener('abort', onAbort);
          if (!settled) {
            child.kill();
          }
        };
      });
    };
  };
}
