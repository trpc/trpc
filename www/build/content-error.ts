import { Data } from 'effect';

/** A page, example app or included file the docs can't build from. */
export class ContentError extends Data.TaggedError('ContentError')<{
  readonly cause?: unknown;
  readonly message: string;
}> {}

/** The message of something thrown, for a `ContentError` that wraps it. */
export function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
