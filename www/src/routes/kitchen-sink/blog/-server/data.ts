/** The showcase's blog: its authors and their posts. */
export interface Author {
  readonly bio: string;
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
}

export interface Post {
  readonly authorId: string;
  readonly body: string;
  /** An ISO date, so it reaches the browser as it is */
  readonly publishedAt: string;
  readonly slug: string;
  readonly title: string;
}

export const authors: ReadonlyArray<Author> = [
  {
    bio: 'Writes about databases and the people who page them at night.',
    id: 'ada',
    name: 'Ada Brandt',
    teamId: 'infrastructure',
  },
  {
    bio: 'Frontend engineer. Has opinions about loading spinners.',
    id: 'lin',
    name: 'Lin Okafor',
    teamId: 'web',
  },
  {
    bio: 'Keeps the platform running, and a small sourdough operation.',
    id: 'sam',
    name: 'Sam Veldkamp',
    teamId: 'infrastructure',
  },
  {
    bio: 'Designs the components everyone else copies.',
    id: 'noor',
    name: 'Noor Haddad',
    teamId: 'web',
  },
];

/** Enough titles for each team's "More from" list to need a few pages */
const titlesByAuthor: Readonly<Record<string, ReadonlyArray<string>>> = {
  lin: [
    'The cheapest request is the one you never send',
    'Skeletons in the UI',
    'A spinner is not a plan',
    'What the back button remembers',
    'Forms are conversations',
    'Hydration, explained with a kettle',
    'Your loading state is a product decision',
    'The URL is the oldest state manager',
    'Optimistic updates and the lies we tell',
    'Why the page jumped',
    'Suspense boundaries are layout decisions',
    'Caching is remembering on purpose',
    'Ship the boring table first',
  ],
  ada: [
    'An index is a promise you make to your future self',
    'Migrations without fear',
    'Null is an opinion',
    'The query planner is not your enemy',
    'Backups you have never restored are a rumour',
    'Foreign keys are documentation that runs',
    'One transaction, one story',
    'Count is the most expensive word in SQL',
    'Pagination has three hard problems',
    'Soft deletes, hard regrets',
    'What an N+1 costs at 3pm on a Tuesday',
    'Timestamps need a time zone and a witness',
    'Read replicas and other half-truths',
  ],
  sam: [
    'On-call is a design review that happens at 3am',
    'Dashboards nobody opens',
    'The deploy button should be boring',
    'Alerts are interruptions with a budget',
    'Postmortems without a villain',
    'Capacity planning is a weather forecast',
    'Feature flags outlive their features',
    'A runbook is a letter to a tired stranger',
    'Staging is a rumour about production',
    'Rollbacks are a feature',
    'The queue is where latency hides',
    'Every cron job is a tiny employee',
    'Sourdough, and other long-running processes',
  ],
  noor: [
    'Design tokens are an API',
    'The empty state is the first impression',
    'A button has six states',
    'Focus rings are not optional',
    'Dark mode is a second product',
    'Spacing is the cheapest polish',
  ],
};

const bodies = [
  'A page that loads a post, then its author, then the posts of the author’s team pays for the network three times. Most of that wait is the trip, not the work.',
  'Every shortcut speeds up the case you expected and slows down the one you forgot about. Pick the cases you can name.',
  'It is an apology in advance. It is still better than a layout that jumps when the data lands.',
  'If a system needs a person awake to keep it running, the system is not finished yet.',
  'Add the new thing, write to both, backfill, read from the new one, drop the old one. Five dull steps beat one exciting one.',
  'Measure it before you argue about it. The slow part is rarely the part you were sure about.',
];

const DAY_MS = 24 * 60 * 60 * 1000;
const newest = Date.parse('2026-10-02');

/** Newest first, with the authors taking turns */
export const posts: ReadonlyArray<Post> = Array.from(
  { length: 13 },
  (_, round) =>
    Object.entries(titlesByAuthor).flatMap(([authorId, titles]) => {
      const title = titles[round];
      return title === undefined ? [] : [{ authorId, title }];
    }),
)
  .flat()
  .map((post, index) => ({
    ...post,
    body: bodies[index % bodies.length] ?? '',
    publishedAt: new Date(newest - index * 4 * DAY_MS).toISOString(),
    slug: post.title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, ''),
  }));
