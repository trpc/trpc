import type { OpenQuestion, QuestionOption } from './decision-types.ts';

/**
 * What an option's copy button puts on the clipboard, for the human to
 * paste into the decision round's chat: markdown that stands alone, so the
 * agent can act on it without opening the page.
 */
export function decisionAnswerMessage(
  question: Pick<OpenQuestion, 'path' | 'questions' | 'title'>,
  option: Pick<QuestionOption, 'id' | 'title'>,
  url: string,
): string {
  return [
    `- Decision: ${question.title}`,
    `- File: \`${question.path}\``,
    ...(question.questions.length === 0
      ? []
      : [`- Question: ${question.questions.join(', ')}`]),
    `- Answer: ${option.id}) ${option.title}`,
    `- Page: ${url}`,
  ].join('\n');
}
