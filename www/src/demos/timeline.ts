/**
 * The simulated requests of the post page in "Fetch-on-render" and
 * "Render-as-you-fetch": a post and its comments, each one round trip long.
 */
export type LoadingStrategy = 'fetch-on-render' | 'render-as-you-fetch';

export interface TimelineRequest {
  readonly label: string;
  readonly start: number;
  readonly end: number;
}

export interface TimelineStep {
  readonly at: number;
  readonly text: string;
}

export interface Timeline {
  readonly requests: readonly [
    post: TimelineRequest,
    comments: TimelineRequest,
  ];
  /** What the page does, in time order. */
  readonly steps: ReadonlyArray<TimelineStep>;
  readonly readyAt: number;
}

export function timeline(
  strategy: LoadingStrategy,
  roundTrip: number,
): Timeline {
  if (strategy === 'fetch-on-render') {
    return {
      readyAt: 2 * roundTrip,
      requests: [
        { end: roundTrip, label: 'post.byId', start: 0 },
        { end: 2 * roundTrip, label: 'post.comments', start: roundTrip },
      ],
      steps: [
        { at: 0, text: 'PostPage renders and starts post.byId' },
        {
          at: roundTrip,
          text: 'The post arrives. Comments renders and starts post.comments',
        },
        { at: 2 * roundTrip, text: 'The comments arrive' },
      ],
    };
  }
  return {
    readyAt: roundTrip,
    requests: [
      { end: roundTrip, label: 'post.byId', start: 0 },
      { end: roundTrip, label: 'post.comments', start: 0 },
    ],
    steps: [
      { at: 0, text: 'The loader starts post.byId and post.comments' },
      { at: roundTrip, text: 'Both arrive, and the page renders them' },
    ],
  };
}

/** How far `request` is at `time`, from 0 (not started) to 1 (done). */
export function progress(request: TimelineRequest, time: number) {
  if (time <= request.start) {
    return 0;
  }
  return Math.min(1, (time - request.start) / (request.end - request.start));
}

export function roundTrips(strategy: LoadingStrategy) {
  return strategy === 'fetch-on-render' ? 2 : 1;
}
