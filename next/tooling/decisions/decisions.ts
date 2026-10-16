/**
 * Reads `.agent-docs/decisions/*.md`. Run as a script to list or search them:
 *
 *   pnpm decisions                 every decision, who made it, and its questions
 *   pnpm decisions openapi         decisions whose text matches (a regex, case-insensitive)
 *   pnpm decisions --who agent     only agent calls (`human`, `asked`, `agent`)
 *   pnpm decisions --open          only decisions with an `Open:` bullet, printing it
 *   pnpm decisions --agent-bullets agent calls inside human decisions too
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Who = 'human' | 'human asked' | 'agent';

export interface Decision {
  readonly file: string;
  readonly title: string;
  readonly who: Who;
  /** `Q7.2`-style question numbers the file cites. */
  readonly questions: ReadonlyArray<string>;
  /** `- Open:` and `- (agent) Open:` bullets. */
  readonly open: ReadonlyArray<string>;
  /** `- (agent …)` bullets: the agent's calls, also inside `(human)` files. */
  readonly agentBullets: ReadonlyArray<string>;
  readonly livesIn: string | undefined;
  readonly text: string;
}

export const decisionsDir: URL = new URL(
  '../../.agent-docs/decisions/',
  import.meta.url,
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

export function parseDecision(file: string, text: string): Decision {
  const first = text.split('\n', 1)[0] ?? '';
  const match = TITLE.exec(first);
  if (!match) {
    throw new Error(
      `${file}: the first line must be "# Title (human|human asked|agent)", got "${first}"`,
    );
  }
  const all = bullets(text);
  return {
    file,
    title: match[1]!,
    who: match[2] as Who,
    questions: [...new Set(text.match(/\bQ\d+\.\d+\b/g) ?? [])],
    open: all.filter((b) => /^(\(agent[^)]*\) )?Open\b/.test(b)),
    agentBullets: all.filter((b) => b.startsWith('(agent')),
    livesIn: all
      .find((b) => b.startsWith('Lives in:'))
      ?.slice('Lives in:'.length)
      .trim(),
    text,
  };
}

export function readDecisions(dir: URL = decisionsDir): Decision[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseDecision(f, readFileSync(new URL(f, dir), 'utf8')));
}

const WHO_FLAG: Record<string, Who> = {
  human: 'human',
  asked: 'human asked',
  agent: 'agent',
};

function main(args: string[]): void {
  let who: Who | undefined;
  let open = false;
  let agentBullets = false;
  const terms: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--who') who = WHO_FLAG[args[++i] ?? ''];
    else if (arg === '--open') open = true;
    else if (arg === '--agent-bullets') agentBullets = true;
    else terms.push(arg);
  }
  const query = terms.length > 0 ? new RegExp(terms.join(' '), 'i') : undefined;
  const found = readDecisions().filter(
    (d) =>
      (!who || d.who === who) &&
      (!open || d.open.length > 0) &&
      (!agentBullets || d.who === 'agent' || d.agentBullets.length > 0) &&
      (!query || query.test(d.text)),
  );
  for (const d of found) {
    const questions =
      d.questions.length > 0 ? ` [${d.questions.join(' ')}]` : '';
    console.log(`${d.file.padEnd(44)} (${d.who}) ${d.title}${questions}`);
    if (open)
      for (const o of d.open) console.log(`    ${o.replace(/\n/g, '\n    ')}`);
    if (agentBullets && d.who !== 'agent') {
      for (const b of d.agentBullets) console.log(`    ${b.split('\n')[0]}`);
    }
  }
  console.log(`\n${found.length} of ${readDecisions().length} decisions`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
