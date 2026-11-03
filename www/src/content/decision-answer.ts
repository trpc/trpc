import type { OpenQuestion } from './decision-types.ts';

/** What `skip` means in a decision round: defer it, never decide it. */
export const skipMeaning =
  "Defer it: leave the open file as it is for a later round; don't make the call or record anything.";

export interface DecisionAnswer {
  /** An option's letter, or `skip`. */
  readonly answer: string;
  /** Free text from the human, quoted in the message; empty for none. */
  readonly note: string;
  readonly question: Pick<
    OpenQuestion,
    'options' | 'path' | 'recommended' | 'slug' | 'title'
  >;
  /** The proposal questions it answers (`Q26.1`); none when the page cites none. */
  readonly questionIds: ReadonlyArray<string>;
  /** The question's page. */
  readonly url: string;
}

/**
 * The message the human pastes into chat for the agent running the
 * decision round: markdown that stands alone, so the agent can act on it
 * without opening the page.
 */
export function decisionAnswerMessage(input: DecisionAnswer): string {
  const question = input.question;
  const ids = input.questionIds.join(', ');
  const about = ids === '' ? question.slug : `${question.slug} (${ids})`;
  const recommended = question.options.find(
    (option) => option.id === question.recommended,
  );
  const recommendedLine = recommended
    ? `${recommended.id}) ${recommended.title}`
    : question.recommended;
  const note = input.note.trim().replaceAll(/\s+/g, ' ');
  const chosen =
    input.answer === 'skip'
      ? undefined
      : question.options.find((option) => option.id === input.answer);

  const head =
    chosen === undefined
      ? `Decision skipped for ${about}: leave it open for a later round.`
      : chosen.id === question.recommended
        ? `Decision answer for ${about}: ${chosen.id}, the recommended option.`
        : `Decision answer for ${about}: ${chosen.id}, not the recommended option (${question.recommended}).`;
  const lines = [
    `- Decision: ${question.title}`,
    `- File: \`${question.path}\``,
    ...(ids === ''
      ? []
      : [
          `- ${input.questionIds.length > 1 ? 'Questions' : 'Question'}: ${ids}`,
        ]),
    chosen === undefined
      ? `- Answer: skip. ${skipMeaning}`
      : `- Answer: ${chosen.id}) ${chosen.title}`,
    ...(chosen === undefined
      ? []
      : [
          chosen.id === question.recommended
            ? '- Recommended: yes'
            : `- Recommended: no, the recommendation is ${recommendedLine}`,
        ]),
    ...(note === '' ? [] : [`- Note: "${note}"`]),
    `- Page: ${input.url}`,
  ];
  return `${head}\n\n${lines.join('\n')}`;
}
