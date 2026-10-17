/**
 * Reads `.agent-docs/decisions/*.md`. Run as a script to list or search them:
 *
 *   pnpm decisions                 every decision, who made it, and its questions
 *   pnpm decisions openapi         decisions whose text matches (a regex, case-insensitive)
 *   pnpm decisions --who agent     only agent calls (`human`, `asked`, `agent`)
 *   pnpm decisions --open          only decisions with an `Open:` bullet, printing it
 *   pnpm decisions --agent-bullets agent calls inside human decisions too
 *   pnpm decisions --tentative     only decisions with a `Tentative (human):` bullet, printing it
 *   pnpm decisions --questions     every proposal question and the decisions citing it
 */
import { fileURLToPath } from 'node:url';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Data, Effect, FileSystem, Option, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import type { PlatformError } from 'effect/PlatformError';

export type Who = 'human' | 'human asked' | 'agent';

export interface Decision {
  readonly file: string;
  readonly title: string;
  readonly who: Who;
  /** `Q7.2`-style question numbers the file cites. */
  readonly questions: ReadonlyArray<string>;
  /** `- Open:` and `- (agent) Open:` bullets. */
  readonly open: ReadonlyArray<string>;
  /** `- Tentative (human):` bullets: answers the human flagged as open to challenge. */
  readonly tentative: ReadonlyArray<string>;
  /** `- (agent …)` bullets: the agent's calls, also inside `(human)` files. */
  readonly agentBullets: ReadonlyArray<string>;
  readonly livesIn: string | undefined;
  readonly text: string;
}

export class InvalidDecision extends Data.TaggedError('InvalidDecision')<{
  readonly file: string;
  readonly message: string;
}> {}

export const decisionsDir: string = fileURLToPath(
  new URL('../../.agent-docs/decisions/', import.meta.url),
);

export const proposalsDir: string = fileURLToPath(
  new URL('../../.agent-docs/proposals/', import.meta.url),
);

const TITLE = /^# (.+) \((human|human asked|agent)\)$/;

/** Top-level bullets, each with its indented continuation lines. */
function bullets(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) out.push(line.slice(2));
    else if (line.startsWith('  ') && out.length > 0) {
      out[out.length - 1] += `\n${line}`;
    }
  }
  return out;
}

export const parseDecision = (
  file: string,
  text: string,
): Effect.Effect<Decision, InvalidDecision> => {
  const first = text.split('\n', 1)[0] ?? '';
  const match = TITLE.exec(first);
  if (!match) {
    return Effect.fail(
      new InvalidDecision({
        file,
        message: `${file}: the first line must be "# Title (human|human asked|agent)", got "${first}"`,
      }),
    );
  }
  const all = bullets(text);
  return Effect.succeed({
    file,
    title: match[1]!,
    who: match[2] as Who,
    questions: [...new Set(text.match(/\bQ\d+\.\d+\b/g) ?? [])],
    open: all.filter((b) => /^(\(agent[^)]*\) )?Open\b/.test(b)),
    tentative: all.filter((b) => b.startsWith('Tentative (human):')),
    agentBullets: all.filter((b) => b.startsWith('(agent')),
    livesIn: all
      .find((b) => b.startsWith('Lives in:'))
      ?.slice('Lives in:'.length)
      .trim(),
    text,
  });
};

const markdownFiles = (dir: string, pattern: RegExp) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = (yield* fs.readDirectory(dir))
      .filter((f) => pattern.test(f))
      .sort();
    return yield* Effect.forEach(files, (file) =>
      Effect.map(fs.readFileString(path.join(dir, file)), (text) => ({
        file,
        text,
      })),
    );
  });

export const readDecisions = (
  dir: string = decisionsDir,
): Effect.Effect<
  ReadonlyArray<Decision>,
  PlatformError | InvalidDecision,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.flatMap(markdownFiles(dir, /\.md$/), (files) =>
    Effect.forEach(files, (opts) => parseDecision(opts.file, opts.text)),
  );

export interface Question {
  readonly question: string;
  readonly proposal: string;
  readonly text: string;
}

/** The `- **Q7.2**` questions each proposal asks, in order. */
export const readQuestions = (
  dir: string = proposalsDir,
): Effect.Effect<
  ReadonlyArray<Question>,
  PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.map(markdownFiles(dir, /^\d+-.*\.md$/), (files) =>
    files.flatMap((opts) =>
      [...opts.text.matchAll(/^- \*\*(Q\d+\.\d+)\*\* (.*)$/gm)].map(
        ([, question, questionText]) => ({
          question: question!,
          proposal: opts.file,
          text: questionText!,
        }),
      ),
    ),
  );

export interface QuestionCitations {
  readonly question: string;
  readonly proposal: string;
  readonly decisions: ReadonlyArray<string>;
}

/** Each proposal question with the decisions that cite it. */
export const questionIndex = (
  decisions: ReadonlyArray<Decision>,
): Effect.Effect<
  ReadonlyArray<QuestionCitations>,
  PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.map(readQuestions(), (questions) =>
    questions.map((opts) => ({
      question: opts.question,
      proposal: opts.proposal,
      decisions: decisions
        .filter((d) => d.questions.includes(opts.question))
        .map((d) => `${d.file} (${d.who})`),
    })),
  );

export interface Filters {
  readonly who: Who | undefined;
  readonly open: boolean;
  readonly tentative: boolean;
  readonly agentBullets: boolean;
  readonly query: RegExp | undefined;
}

export const filterDecisions = (
  decisions: ReadonlyArray<Decision>,
  filters: Filters,
): ReadonlyArray<Decision> =>
  decisions.filter(
    (d) =>
      (!filters.who || d.who === filters.who) &&
      (!filters.open || d.open.length > 0) &&
      (!filters.tentative || d.tentative.length > 0) &&
      (!filters.agentBullets ||
        d.who === 'agent' ||
        d.agentBullets.length > 0) &&
      (!filters.query || filters.query.test(d.text)),
  );

const listQuestions = Effect.gen(function* () {
  const index = yield* questionIndex(yield* readDecisions());
  for (const q of index) {
    const where = q.decisions.length > 0 ? q.decisions.join(', ') : '—';
    yield* Console.log(
      `${q.question.padEnd(7)} ${q.proposal.padEnd(40)} ${where}`,
    );
  }
});

const listDecisions = (filters: Filters) =>
  Effect.gen(function* () {
    const all = yield* readDecisions();
    const found = filterDecisions(all, filters);
    for (const d of found) {
      const questions =
        d.questions.length > 0 ? ` [${d.questions.join(' ')}]` : '';
      yield* Console.log(
        `${d.file.padEnd(44)} (${d.who}) ${d.title}${questions}`,
      );
      const details = [
        ...(filters.open ? d.open.map((o) => o.replace(/\n/g, '\n    ')) : []),
        ...(filters.tentative ? d.tentative.map((t) => t.split('\n')[0]) : []),
        ...(filters.agentBullets && d.who !== 'agent'
          ? d.agentBullets.map((b) => b.split('\n')[0])
          : []),
      ];
      for (const detail of details) yield* Console.log(`    ${detail}`);
    }
    yield* Console.log(`\n${found.length} of ${all.length} decisions`);
  });

export const decisionsCommand = Command.make(
  'decisions',
  {
    terms: Argument.String('terms').pipe(
      Argument.variadic(),
      Argument.withDescription('A regex to match against the text'),
    ),
    who: Flag.ChoiceWithValue('who', [
      ['human', 'human'],
      ['asked', 'human asked'],
      ['agent', 'agent'],
    ] as const).pipe(Flag.optional),
    open: Flag.Boolean('open').pipe(Flag.withDefault(false)),
    tentative: Flag.Boolean('tentative').pipe(Flag.withDefault(false)),
    agentBullets: Flag.Boolean('agent-bullets').pipe(Flag.withDefault(false)),
    questions: Flag.Boolean('questions').pipe(Flag.withDefault(false)),
  },
  (opts) =>
    opts.questions
      ? listQuestions
      : listDecisions({
          who: Option.getOrUndefined(opts.who),
          open: opts.open,
          tentative: opts.tentative,
          agentBullets: opts.agentBullets,
          query:
            opts.terms.length > 0
              ? new RegExp(opts.terms.join(' '), 'i')
              : undefined,
        }),
).pipe(Command.withDescription('List and search the decision records'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Command.run(decisionsCommand, { version: '0.0.0' }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
