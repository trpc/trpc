import { Link } from '@tanstack/react-router';
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
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { Badge } from '@shared/ui/components/badge';
import { buttonVariants } from '@shared/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@shared/ui/components/collapsible';
import { Input } from '@shared/ui/components/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@shared/ui/components/tabs';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@shared/ui/components/toggle-group';
import { cn } from '@shared/ui/lib/utils';
import { DocBody } from '~/components/doc-body.tsx';
import { TextWithCode } from '~/components/text-with-code.tsx';
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

/** A single-choice filter: pressing the chosen chip again clears it. */
function ChipFilter<T extends string>(props: {
  readonly label: string;
  readonly onChange: (value: T | undefined) => void;
  readonly options: ReadonlyArray<readonly [T, string, number]>;
  readonly value: T | undefined;
}) {
  return (
    <ToggleGroup
      aria-label={props.label}
      className="flex-wrap"
      onValueChange={(value) => props.onChange(value[0] as T | undefined)}
      size="sm"
      spacing={1}
      value={props.value === undefined ? [] : [props.value]}
      variant="outline"
    >
      {props.options.map(([value, label, count]) => (
        <ToggleGroupItem
          className="aria-pressed:border-foreground/40"
          key={value}
          value={value}
        >
          {label}
          <span className="text-muted-foreground tabular-nums">{count}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string | undefined>();
  const [status, setStatus] = useState<QuestionStatus | undefined>();
  const [who, setWho] = useState<DecisionWho | undefined>();
  const [withOpen, setWithOpen] = useState<'open' | undefined>();

  const questions = openQuestions.filter(
    (question) =>
      (area === undefined || question.area === area) &&
      (status === undefined || question.status === status) &&
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
      (withOpen === undefined || decision.open > 0) &&
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
            value,
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by words, a slug or a question number (Q24.4)"
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
            onChange={setStatus}
            options={statusOptions}
            value={status}
          />
          <ChipFilter
            label="Area"
            onChange={setArea}
            options={areaOptions}
            value={area}
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
        <div className="flex flex-wrap gap-2">
          <ChipFilter
            label="Who decided"
            onChange={setWho}
            options={whoOptions}
            value={who}
          />
          <ChipFilter
            label="Open bullets"
            onChange={setWithOpen}
            options={[
              [
                'open',
                'Has open points',
                decisionRecords.filter((decision) => decision.open > 0).length,
              ],
            ]}
            value={withOpen}
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

function ProsCons(props: { readonly option: QuestionOption }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
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
    <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
      <span>
        {props.option.id}) <TextWithCode text={props.option.title} />
      </span>
      {props.recommended ? <RecommendedBadge /> : null}
    </h3>
  );
}

const optionHash = (id: string) => `#option-${id.toLowerCase()}`;

function Options(props: { readonly question: OpenQuestion }) {
  const question = props.question;
  const [selected, setSelected] = useState(question.recommended);
  const [view, setView] = useState<'tabs' | 'side-by-side'>('tabs');
  useEffect(() => {
    const linked = question.options.find(
      (option) => optionHash(option.id) === window.location.hash,
    );
    if (linked) {
      setSelected(linked.id);
    }
  }, [question.options]);
  const select = (id: string) => {
    setSelected(id);
    history.replaceState(history.state, '', optionHash(id));
  };
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {question.options.length} options
        </h2>
        <ToggleGroup
          aria-label="How to show the options"
          onValueChange={(value) => {
            if (value[0] === 'tabs' || value[0] === 'side-by-side') {
              setView(value[0]);
            }
          }}
          size="sm"
          spacing={0}
          value={[view]}
          variant="outline"
        >
          <ToggleGroupItem value="tabs">
            <PanelTop /> One at a time
          </ToggleGroupItem>
          <ToggleGroupItem value="side-by-side">
            <Columns2 /> Side by side
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === 'tabs' ? (
        <Tabs onValueChange={(value) => select(String(value))} value={selected}>
          <TabsList
            className="h-auto w-full flex-wrap justify-start gap-1"
            variant="line"
          >
            {question.options.map((option) => (
              <TabsTrigger
                className="h-auto flex-none justify-start px-2 py-1 text-left whitespace-normal"
                key={option.id}
                value={option.id}
              >
                <span className="font-mono">{option.id}</span>
                <span className="max-w-64 truncate">
                  {stripInlineCode(option.title)}
                </span>
                {option.id === question.recommended ? (
                  <Star
                    aria-label="Recommended"
                    className="fill-amber-500 text-amber-500"
                  />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {question.options.map((option) => (
            <TabsContent
              className="grid gap-4 rounded-xl border p-4 sm:p-5"
              id={optionHash(option.id).slice(1)}
              keepMounted
              key={option.id}
              value={option.id}
            >
              <OptionHeading
                option={option}
                recommended={option.id === question.recommended}
              />
              <DocBody html={option.html} />
              <ProsCons option={option} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            question.options.length === 2
              ? 'lg:grid-cols-2'
              : 'lg:grid-cols-2 2xl:grid-cols-3',
          )}
        >
          {question.options.map((option) => (
            <div
              className={cn(
                'grid min-w-0 content-start gap-3 rounded-xl border p-4',
                option.id === question.recommended &&
                  'border-amber-500/50 ring-1 ring-amber-500/30',
              )}
              key={option.id}
            >
              <OptionHeading
                option={option}
                recommended={option.id === question.recommended}
              />
              <DocBody className="prose-sm" html={option.html} />
              <div className="grid gap-3">
                <ProsCons option={option} />
              </div>
            </div>
          ))}
        </div>
      )}
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
        <div className="flex flex-wrap gap-2">
          {buttons.map((link) => {
            const Icon = linkIcons[link.kind] ?? FileText;
            return (
              <a
                className={cn(
                  buttonVariants({
                    variant: link.kind === 'pr' ? 'default' : 'outline',
                  }),
                  'h-auto min-h-8 py-1 text-left whitespace-normal',
                )}
                href={link.href}
                key={link.href}
              >
                <Icon data-icon="inline-start" />
                <span className="capitalize">{link.kind}</span>
                <span className="font-normal opacity-80">
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
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                href={link.href}
              >
                <span className="text-xs tracking-wide uppercase opacity-70">
                  {link.kind}
                </span>
                <TextWithCode bare text={link.label} />
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
        <Collapsible className="rounded-xl border">
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
