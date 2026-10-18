import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '../server/router.ts';

export interface CallLog {
  path: string;
  type: string;
  ok: boolean;
}

/** The app's own link: records each call's result, as a metrics link would. */
export const callLogLink =
  (log: CallLog[]): TRPCLink<AppRouter> =>
  () =>
  (opts) =>
    observable((observer) =>
      opts.next(opts.op).subscribe({
        next(result) {
          log.push({ path: opts.op.path, type: opts.op.type, ok: true });
          observer.next(result);
        },
        error(err) {
          log.push({ path: opts.op.path, type: opts.op.type, ok: false });
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      }),
    );
