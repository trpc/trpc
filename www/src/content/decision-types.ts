import type { Area, LinkKind } from '@tooling/decisions/open';

export type { Area, LinkKind };

export type DecisionWho = 'human' | 'human asked' | 'agent';

/**
 * Where an open question stands: a PR or a spike waiting for a verdict, or
 * only a write-up.
 */
export type QuestionStatus = 'pr' | 'spike' | 'open';

/** What the index needs about an open question (`.agent-docs/open/*.md`). */
export interface OpenQuestionMeta {
  readonly area: Area;
  readonly questions: ReadonlyArray<string>;
  /** The recommended option's letter. */
  readonly recommended: string;
  /** The file name without `.md`. */
  readonly slug: string;
  readonly status: QuestionStatus;
  readonly summary: string;
  readonly title: string;
}

export interface QuestionLink {
  readonly href: string;
  readonly kind: LinkKind;
  readonly label: string;
}

export interface QuestionOption {
  /** The option's prose and code, without its pros and cons, highlighted at build time. */
  readonly html: string;
  /** `A`, `B`, … */
  readonly id: string;
  /** Its `- ✅` bullets, as a list, without the mark. */
  readonly pros: string;
  /** Its `- ❌` bullets, as a list, without the mark. */
  readonly cons: string;
  readonly title: string;
}

/** An open question, its sections highlighted at build time. */
export interface OpenQuestion extends OpenQuestionMeta {
  readonly blocked: string;
  /** Collapsed until opened. */
  readonly details: string | undefined;
  readonly links: ReadonlyArray<QuestionLink>;
  readonly options: ReadonlyArray<QuestionOption>;
  readonly recommendation: string;
  /** The file on GitHub. */
  readonly source: string;
  readonly why: string;
}

/** What the index needs about a decision (`.agent-docs/decisions/*.md`). */
export interface DecisionMeta {
  /** The latest date its bullets give (`2026-10-15`), if any. */
  readonly date: string | undefined;
  /** Its first bullet, as plain text, cut short. */
  readonly excerpt: string;
  /** How many `Open:` bullets it has. */
  readonly open: number;
  /** `Q7.2`-style question numbers it cites. */
  readonly questions: ReadonlyArray<string>;
  readonly slug: string;
  /** Whether a human answer in it is flagged as tentative. */
  readonly tentative: boolean;
  readonly title: string;
  readonly who: DecisionWho;
}

export interface Decision extends DecisionMeta {
  /** The record without its title, highlighted at build time. */
  readonly html: string;
  /** The file on GitHub. */
  readonly source: string;
}
