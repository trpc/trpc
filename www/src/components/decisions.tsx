import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowLeft,
  ChevronRight,
  Columns2,
  Eye,
  FileText,
  FlaskConical,
  GitPullRequest,
  Lock,
  type LucideIcon,
  PanelTop,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@shared/ui/components/collapsible';
import { Input } from '@shared/ui/components/input';
import { cn } from '@shared/ui/lib/utils';
import { DocBody } from '~/components/doc-body.tsx';
import { TextWithCode } from '~/components/text-with-code.tsx';
import {
  type DecisionsIndexSearch,
  optionParam,
  shownOption,
  whoOf,
  whoParamOf,
  type WhoParam,
} from '~/content/decision-search.ts';
import type {
  Decision,
  DecisionMeta,
  DecisionWho,
  LinkKind,
  OpenQuestion,
  OpenQuestionMeta,
  QuestionOption,
  QuestionStatus,
} from '~/content/decision-types.ts';
import {
  decisionRecords,
  findDecision,
  findOpenQuestion,
  openQuestions,
} from '~/content/decisions.ts';
import { stripInlineCode } from '~/content/inline-code.ts';
import { site } from '~/site.ts';

/**
 * Every page here says `noindex, nofollow`, whatever the host, and has no
 * canonical link or social card: nothing should find it but a link to it.
 */
export function decisionsHead(title: string, description: string) {
  return {
    meta: [
      { title: `${stripInlineCode(title)} | Decisions | ${site.name}` },
      { content: 'noindex, nofollow', name: 'robots' },
      { content: stripInlineCode(description), name: 'description' },
    ],
  };
}

export const indexHead = () =>
  decisionsHead(
    'Design decisions',
    "tRPC v12's open questions, and the decisions made so far.",
  );

export function openQuestionHead(slug: string) {
  const question = findOpenQuestion(slug);
  return question
    ? decisionsHead(question.title, question.summary)
    : { meta: [{ title: `Not found | ${site.name}` }] };
}

export function decisionHead(slug: string) {
  const decision = findDecision(slug);
  return decision
    ? decisionsHead(decision.title, decision.excerpt)
    : { meta: [{ title: `Not found | ${site.name}` }] };
}

const statusLabels: Record<QuestionStatus, string> = {
  open: 'Write-up',
  pr: 'PR to review',
  spike: 'Spike',
};

const statusIcons: Record<QuestionStatus, LucideIcon> = {
  open: FileText,
  pr: GitPullRequest,
  spike: FlaskConical,
};

function StatusBadge(props: { readonly status: QuestionStatus }) {
  const Icon = statusIcons[props.status];
  return (
    <Badge
      variant={
        props.status === 'pr'
          ? 'default'
          : props.status === 'spike'
            ? 'secondary'
            : 'outline'
      }
    >
      <Icon data-icon="inline-start" />
      {statusLabels[props.status]}
    </Badge>
  );
}

const whoLabels: Record<DecisionWho, string> = {
  agent: 'Agent',
  human: 'Human',
  'human asked': 'Human asked',
};

function WhoBadge(props: { readonly who: DecisionWho }) {
  return (
    <Badge variant={props.who === 'agent' ? 'outline' : 'secondary'}>
      {whoLabels[props.who]}
    </Badge>
  );
}

const linkIcons: Partial<Record<LinkKind, LucideIcon>> = {
  pr: GitPullRequest,
  preview: Eye,
  spike: FlaskConical,
};

const matches = (query: string, ...texts: ReadonlyArray<string>) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = texts.join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
};

/**
 * A link's props marking it as the choice the page shows. `<Link>` replaces
 * `aria-current` with `"page"` on a link to the URL it's on, query aside
 * unless `includeSearch`; a chosen chip links to clearing it, so styles read
 * `data-chosen`.
 */
const chooses = (chosen: boolean) => ({
  activeOptions: { exact: true, includeSearch: true },
  'aria-current': chosen ? ('true' as const) : undefined,
  'data-chosen': chosen || undefined,
});

type IndexSearchUpdate = (prev: DecisionsIndexSearch) => DecisionsIndexSearch;

/**
 * A single-choice filter, as links to the index with each choice: the
 * chosen chip's link clears it. On a phone the chips scroll sideways in one
 * row, instead of wrapping into several.
 */
function ChipFilter<T extends string>(props: {
  readonly label: string;
  readonly options: ReadonlyArray<readonly [T, string, number]>;
  readonly search: (value: T | undefined) => IndexSearchUpdate;
  readonly value: T | undefined;
}) {
  return (
    <div
      aria-label={props.label}
      className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      role="group"
    >
      {props.options.map(([value, label, count]) => {
        const chosen = value === props.value;
        return (
          <Link
            {...chooses(chosen)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors hover:bg-muted data-chosen:border-foreground/40 data-chosen:bg-muted"
            from="/v12/decisions/"
            key={value}
            resetScroll={false}
            search={props.search(chosen ? undefined : value)}
            to="."
          >
            {label}
            <span className="text-muted-foreground tabular-nums">{count}</span>
          </Link>
        );
      })}
    </div>
  );
}

const countBy = <T, K extends string>(
  items: ReadonlyArray<T>,
  key: (item: T) => K,
): ReadonlyArray<readonly [K, number]> => {
  const counts = new Map<K, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return [...counts];
};

function QuestionCard(props: { readonly question: OpenQuestionMeta }) {
  const question = props.question;
  return (
    <Link
      className="group grid h-full content-start gap-2.5 rounded-xl border p-4 transition-colors hover:bg-accent/50"
      params={{ slug: question.slug }}
      to="/v12/decisions/open/$slug"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{question.area}</Badge>
        <StatusBadge status={question.status} />
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="size-3 fill-current text-amber-500" />
          {question.recommended}
        </span>
      </div>
      <h3 className="font-semibold tracking-tight text-pretty group-hover:underline">
        <TextWithCode text={question.title} />
      </h3>
      <p className="text-sm text-pretty text-muted-foreground">
        <TextWithCode text={question.summary} />
      </p>
    </Link>
  );
}

function DecisionRow(props: { readonly decision: DecisionMeta }) {
  const decision = props.decision;
  return (
    <Link
      className="group grid gap-1 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50"
      params={{ slug: decision.slug }}
      to="/v12/decisions/$slug"
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <WhoBadge who={decision.who} />
        <span className="font-medium text-pretty group-hover:underline">
          <TextWithCode text={decision.title} />
        </span>
        {decision.open > 0 ? (
          <Badge variant="outline">{decision.open} open</Badge>
        ) : null}
        {decision.tentative ? <Badge variant="outline">Tentative</Badge> : null}
        {decision.date ? (
          <time
            className="ml-auto text-xs text-muted-foreground tabular-nums"
            dateTime={decision.date}
          >
            {decision.date}
          </time>
        ) : null}
      </span>
      <span className="line-clamp-2 text-sm text-muted-foreground">
        {decision.excerpt}
      </span>
    </Link>
  );
}

export function DecisionsIndex() {
  const search = useSearch({ from: '/v12/decisions/' });
  const navigate = useNavigate({ from: '/v12/decisions/' });
  // What's typed, while the URL catches up: the box isn't held to the
  // router's update of `?q=` between keystrokes.
  const [draft, setDraft] = useState<string>();
  const query = draft ?? search.q ?? '';
  const who = whoOf(search.who);

  const questions = openQuestions.filter(
    (question) =>
      (search.area === undefined || question.area === search.area) &&
      (search.status === undefined || question.status === search.status) &&
      matches(
        query,
        question.title,
        question.summary,
        question.area,
        ...question.questions,
      ),
  );
  const records = decisionRecords.filter(
    (decision) =>
      (who === undefined || decision.who === who) &&
      (search.open === undefined || decision.open > 0) &&
      matches(
        query,
        decision.title,
        decision.excerpt,
        decision.slug,
        ...decision.questions,
      ),
  );
  const areaOptions = useMemo(
    () =>
      countBy(openQuestions, (question) => question.area)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => [value, value, count] as const),
    [],
  );
  const statusOptions = useMemo(
    () =>
      (['pr', 'spike', 'open'] as const).map(
        (value) =>
          [
            value,
            statusLabels[value],
            openQuestions.filter((question) => question.status === value)
              .length,
          ] as const,
      ),
    [],
  );
  const whoOptions = useMemo(
    () =>
      (['human', 'human asked', 'agent'] as const).map(
        (value) =>
          [
            whoParamOf(value),
            whoLabels[value],
            decisionRecords.filter((decision) => decision.who === value).length,
          ] as const,
      ),
    [],
  );

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <header className="grid gap-3">
        <p className="text-sm font-semibold text-link">Decisions</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          What's open, and what's decided
        </h1>
        <p className="max-w-3xl text-pretty text-muted-foreground">
          The questions waiting for a human, each with its options, the code a
          user would write under each, and a recommendation; then every decision
          recorded so far. Rendered from{' '}
          <a
            className="font-medium text-link hover:underline"
            href={`${site.sourceUrl}/.agent-docs`}
          >
            <code className="font-mono text-[0.875em]">.agent-docs/</code>
          </a>
          , and kept out of search engines and the site's navigation.
        </p>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Filter questions and decisions"
            className="pl-8"
            onBlur={() => setDraft(undefined)}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              void navigate({
                replace: true,
                resetScroll: false,
                search: (prev) => ({ ...prev, q: text.trim() || undefined }),
                to: '.',
              });
            }}
            placeholder="Words, a slug or a question (Q24.4)"
            type="search"
            value={query}
          />
        </div>
      </header>

      <section aria-labelledby="open-questions" className="grid gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2
            className="text-xl font-semibold tracking-tight"
            id="open-questions"
          >
            Open questions
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {questions.length} of {openQuestions.length}
          </span>
        </div>
        <div className="grid gap-2">
          <ChipFilter
            label="Status"
            options={statusOptions}
            search={(status) => (prev) => ({ ...prev, status })}
            value={search.status}
          />
          <ChipFilter
            label="Area"
            options={areaOptions}
            search={(area) => (prev) => ({ ...prev, area })}
            value={search.area}
          />
        </div>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open question matches.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {questions.map((question) => (
              <li key={question.slug}>
                <QuestionCard question={question} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decided" className="grid gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-xl font-semibold tracking-tight" id="decided">
            Decided
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {records.length} of {decisionRecords.length}, newest first
          </span>
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <ChipFilter<WhoParam>
            label="Who decided"
            options={whoOptions}
            search={(value) => (prev) => ({ ...prev, who: value })}
            value={search.who}
          />
          <ChipFilter
            label="Open bullets"
            options={[
              [
                'open',
                'Has open points',
                decisionRecords.filter((decision) => decision.open > 0).length,
              ],
            ]}
            search={(value) => (prev) => ({
              ...prev,
              open: value === undefined ? undefined : true,
            })}
            value={search.open ? 'open' : undefined}
          />
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decision matches.</p>
        ) : (
          <ul className="-mx-3 grid divide-y">
            {records.map((decision) => (
              <li key={decision.slug}>
                <DecisionRow decision={decision} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function BackLink() {
  return (
    <Link
      className="flex w-max items-center gap-1.5 text-sm font-semibold text-link hover:underline"
      to="/v12/decisions"
    >
      <ArrowLeft className="size-3.5" /> Decisions
    </Link>
  );
}

function SourceLink(props: { readonly href: string }) {
  return (
    <a
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      href={props.href}
    >
      <FileText className="size-3.5" /> The file on GitHub
    </a>
  );
}

function Section(props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly title: ReactNode;
}) {
  return (
    <section className={cn('grid gap-3', props.className)}>
      <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
      {props.children}
    </section>
  );
}

/** Side by side when its option's card has the room (a container query). */
function ProsCons(props: { readonly option: QuestionOption }) {
  return (
    <div className="grid gap-3 @xl:grid-cols-2">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <ThumbsUp className="size-3.5" /> Pros
        </p>
        <DocBody className="prose-sm" html={props.option.pros} />
      </div>
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-400">
          <ThumbsDown className="size-3.5" /> Cons
        </p>
        <DocBody className="prose-sm" html={props.option.cons} />
      </div>
    </div>
  );
}

function RecommendedBadge() {
  return (
    <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300">
      <Star className="fill-current" data-icon="inline-start" />
      Recommended
    </Badge>
  );
}

function OptionHeading(props: {
  readonly option: QuestionOption;
  readonly recommended: boolean;
}) {
  return (
    <h3
      className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-pretty"
      id={`option-${props.option.id.toLowerCase()}`}
    >
      <span>
        {props.option.id}) <TextWithCode text={props.option.title} />
      </span>
      {props.recommended ? <RecommendedBadge /> : null}
    </h3>
  );
}

const pickerColumns: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

/** An option's prose, code, pros and cons, in a card. */
function OptionCard(props: {
  readonly hidden: boolean;
  readonly option: QuestionOption;
  readonly recommended: boolean;
}) {
  return (
    <article
      aria-labelledby={`option-${props.option.id.toLowerCase()}`}
      className={cn(
        'grid min-w-0 content-start gap-4 rounded-xl border p-3 @container sm:p-5',
        props.recommended && 'border-amber-500/50',
      )}
      hidden={props.hidden}
    >
      <OptionHeading option={props.option} recommended={props.recommended} />
      <DocBody html={props.option.html} />
      <ProsCons option={props.option} />
    </article>
  );
}

/**
 * The options, one at a time under a picker or all of them: side by side
 * from `xl`, where two columns of code have the room, and one under another
 * below it. The picker and the view are links to the URL showing them.
 */
function Options(props: { readonly question: OpenQuestion }) {
  const question = props.question;
  const search = useSearch({ from: '/v12/decisions/open/$slug' });
  const selected = shownOption(
    search.option,
    question.options.map((option) => option.id),
    question.recommended,
  );
  const all = search.view === 'side-by-side';
  const viewLink =
    'inline-flex h-7 items-center gap-1.5 px-2.5 text-[0.8rem] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-chosen:bg-muted data-chosen:text-foreground [&_svg]:size-3.5';
  return (
    <section aria-labelledby="options" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight" id="options">
          {question.options.length} options
        </h2>
        <nav
          aria-label="How to show the options"
          className="flex divide-x overflow-hidden rounded-md border"
        >
          <Link
            {...chooses(!all)}
            className={viewLink}
            from="/v12/decisions/open/$slug"
            resetScroll={false}
            search={(prev) => ({ ...prev, view: undefined })}
            to="."
          >
            <PanelTop /> One at a time
          </Link>
          <Link
            {...chooses(all)}
            className={viewLink}
            from="/v12/decisions/open/$slug"
            resetScroll={false}
            search={(prev) => ({ ...prev, view: 'side-by-side' })}
            to="."
          >
            <Columns2 />
            <span className="xl:hidden">All</span>
            <span className="hidden xl:inline">Side by side</span>
          </Link>
        </nav>
      </div>
      {all ? null : (
        <>
          <nav
            aria-label="Options"
            className={cn(
              'grid gap-2',
              pickerColumns[Math.min(question.options.length, 4)],
            )}
          >
            {question.options.map((option) => (
              <Link
                {...chooses(option.id === selected)}
                className="group flex min-w-0 items-start gap-2.5 rounded-lg border p-2.5 text-sm transition-colors hover:bg-accent/50 data-chosen:border-foreground/40 data-chosen:bg-accent"
                from="/v12/decisions/open/$slug"
                key={option.id}
                resetScroll={false}
                search={(prev) => ({
                  ...prev,
                  option: optionParam(option.id, question.recommended),
                })}
                to="."
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted font-mono text-xs font-semibold group-data-chosen:bg-foreground group-data-chosen:text-background">
                  {option.id}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 pt-0.5 leading-snug font-medium text-pretty">
                  {stripInlineCode(option.title)}
                </span>
                {option.id === question.recommended ? (
                  <Star
                    aria-label="Recommended"
                    className="mt-1 size-3.5 shrink-0 fill-amber-500 text-amber-500"
                  />
                ) : null}
              </Link>
            ))}
          </nav>
        </>
      )}
      {/* Every option is in the HTML, the unchosen ones hidden, so `curl`
          and agents read them all. */}
      <div className={cn('grid gap-4', all && 'xl:grid-cols-2')}>
        {question.options.map((option) => (
          <OptionCard
            hidden={!all && option.id !== selected}
            key={option.id}
            option={option}
            recommended={option.id === question.recommended}
          />
        ))}
      </div>
    </section>
  );
}

function QuestionLinks(props: { readonly question: OpenQuestion }) {
  const buttons = props.question.links.filter(
    (link) => linkIcons[link.kind] !== undefined,
  );
  const others = props.question.links.filter(
    (link) => linkIcons[link.kind] === undefined,
  );
  if (props.question.links.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-2">
      {buttons.length > 0 ? (
        <div className="grid gap-2 sm:flex sm:flex-wrap">
          {buttons.map((link) => {
            const Icon = linkIcons[link.kind] ?? FileText;
            return (
              <a
                className={cn(
                  buttonVariants({
                    variant: link.kind === 'pr' ? 'default' : 'outline',
                  }),
                  'h-auto min-h-8 justify-start py-1 text-left whitespace-normal',
                )}
                href={link.href}
                key={link.href}
              >
                <Icon data-icon="inline-start" />
                <span className="shrink-0 capitalize">{link.kind}</span>
                <span className="min-w-0 font-normal [overflow-wrap:anywhere] opacity-80">
                  <TextWithCode bare text={link.label} />
                </span>
              </a>
            );
          })}
        </div>
      ) : null}
      {others.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 text-sm">
          {others.map((link) => (
            <li key={link.href}>
              <a
                className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                href={link.href}
              >
                <span className="shrink-0 text-xs tracking-wide uppercase opacity-70">
                  {link.kind}
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <TextWithCode bare text={link.label} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// The widest thing in a page's markdown (a `^?` type can be thousands of
// pixels, a table or a path hundreds) would set the page's width through the
// grids around it; it wraps or scrolls instead.
const markdownFits = '[&_.prose]:[contain:inline-size]';

export function OpenQuestionPage(props: { readonly question: OpenQuestion }) {
  const question = props.question;
  const search = useSearch({ from: '/v12/decisions/open/$slug' });
  const navigate = useNavigate({ from: '/v12/decisions/open/$slug' });
  const recommended = question.options.find(
    (option) => option.id === question.recommended,
  );
  return (
    <main
      className={cn(
        'mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-10',
        markdownFits,
      )}
    >
      <header className="grid gap-4">
        <BackLink />
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{question.area}</Badge>
          <StatusBadge status={question.status} />
          {question.questions.map((id) => (
            <Badge key={id} variant="ghost">
              {id}
            </Badge>
          ))}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          <TextWithCode text={question.title} />
        </h1>
        <p className="max-w-3xl text-lg text-pretty text-muted-foreground">
          <TextWithCode text={question.summary} />
        </p>
        <QuestionLinks question={question} />
      </header>

      <Section title="Why it matters">
        <DocBody html={question.why} />
      </Section>

      <Options question={question} />

      <aside className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 sm:p-5">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <Star className="size-4 fill-amber-500 text-amber-500" />
          <span>
            Recommendation: {question.recommended}){' '}
            {recommended ? <TextWithCode text={recommended.title} /> : null}
          </span>
        </p>
        <DocBody html={question.recommendation} />
      </aside>

      <Section
        title={
          <span className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" /> Blocked until it's
            answered
          </span>
        }
      >
        <DocBody html={question.blocked} />
      </Section>

      {question.details === undefined ? null : (
        <Collapsible
          className="rounded-xl border"
          onOpenChange={(open) =>
            void navigate({
              resetScroll: false,
              search: (prev) => ({ ...prev, details: open || undefined }),
              to: '.',
            })
          }
          open={search.details === true}
        >
          <CollapsibleTrigger className="group flex w-full items-center gap-2 p-4 text-left font-semibold">
            <ChevronRight className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
            Details
            <span className="text-sm font-normal text-muted-foreground">
              for a deeper read
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-4 pb-4" keepMounted>
            <DocBody className="pt-4" html={question.details} />
          </CollapsibleContent>
        </Collapsible>
      )}

      <footer className="border-t pt-4">
        <SourceLink href={question.source} />
      </footer>
    </main>
  );
}

export function DecisionPage(props: { readonly decision: Decision }) {
  const decision = props.decision;
  return (
    <main
      className={cn(
        'mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:px-6 sm:py-10',
        markdownFits,
      )}
    >
      <header className="grid gap-4 border-b pb-6">
        <BackLink />
        <div className="flex flex-wrap items-center gap-1.5">
          <WhoBadge who={decision.who} />
          {decision.open > 0 ? (
            <Badge variant="outline">{decision.open} open</Badge>
          ) : null}
          {decision.tentative ? (
            <Badge variant="outline">Tentative</Badge>
          ) : null}
          {decision.questions.map((id) => (
            <Badge key={id} variant="ghost">
              {id}
            </Badge>
          ))}
          {decision.date ? (
            <time
              className="ml-auto text-sm text-muted-foreground tabular-nums"
              dateTime={decision.date}
            >
              {decision.date}
            </time>
          ) : null}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          <TextWithCode text={decision.title} />
        </h1>
      </header>
      <DocBody html={decision.html} />
      <footer className="border-t pt-4">
        <SourceLink href={decision.source} />
      </footer>
    </main>
  );
}
