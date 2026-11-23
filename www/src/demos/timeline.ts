import { jitter, type Random } from './random.ts';

/**
 * The simulated requests of the post page in "Fetch-on-render" and
 * "Render-as-you-fetch": a post and its comments, each taking its own time.
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

/** Each request's usual time, in round trips. The comments are slower. */
export const requestWeights = { comments: 1.5, post: 1 } as const;

/** The longest a timeline can be, in round trips, so replays share an axis. */
export const longestTimeline =
  (requestWeights.post + requestWeights.comments) * jitter.max;

/**
 * The page's requests at `roundTrip` ms per round trip. Without `random`,
 * each takes its usual time; with it, each strays by up to `jitter`.
 */
export function timeline(
  strategy: LoadingStrategy,
  roundTrip: number,
  random?: Random,
): Timeline {
  const duration = (weight: number) =>
    Math.round(
      (roundTrip * weight * (random?.between(jitter.min, jitter.max) ?? 1)) /
        10,
    ) * 10;
  const postTime = duration(requestWeights.post);
  const commentsTime = duration(requestWeights.comments);
  if (strategy === 'fetch-on-render') {
    const readyAt = postTime + commentsTime;
    return {
      readyAt,
      requests: [
        { end: postTime, label: 'post.byId', start: 0 },
        { end: readyAt, label: 'post.comments', start: postTime },
      ],
      steps: [
        { at: 0, text: 'PostPage renders and starts post.byId' },
        {
          at: postTime,
          text: 'The post arrives. Comments renders and starts post.comments',
        },
        { at: readyAt, text: 'The comments arrive' },
      ],
    };
  }
  const arrivals = [
    { at: postTime, text: 'The post arrives and renders' },
    { at: commentsTime, text: 'The comments arrive and render' },
  ].toSorted((a, b) => a.at - b.at);
  return {
    readyAt: Math.max(postTime, commentsTime),
    requests: [
      { end: postTime, label: 'post.byId', start: 0 },
      { end: commentsTime, label: 'post.comments', start: 0 },
    ],
    steps: [
      { at: 0, text: 'The loader starts post.byId and post.comments' },
      ...arrivals,
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
