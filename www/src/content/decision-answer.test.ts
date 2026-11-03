import { describe, expect, it } from '@effect/vitest';

import { decisionAnswerMessage } from './decision-answer.ts';

const question = {
  path: 'next/.agent-docs/open/tanstack-infinite-handles.md',
  questions: ['Q19.3'],
  title:
    'How should an infinite query get a serializable handle, now that its input is a function?',
};
const option = { id: 'A', title: 'No infinite handles' };
const url = 'https://v12.trpc.io/v12/decisions/open/tanstack-infinite-handles';

describe('decisionAnswerMessage', () => {
  it('names the question, its file, the option and the page', () => {
    expect(decisionAnswerMessage(question, option, url)).toBe(
      [
        '- Decision: How should an infinite query get a serializable handle, now that its input is a function?',
        '- File: `next/.agent-docs/open/tanstack-infinite-handles.md`',
        '- Question: Q19.3',
        '- Answer: A) No infinite handles',
        '- Page: https://v12.trpc.io/v12/decisions/open/tanstack-infinite-handles',
      ].join('\n'),
    );
  });

  it('lists every question the page cites, and none when it cites none', () => {
    expect(
      decisionAnswerMessage(
        { ...question, questions: ['Q26.1', 'Q26.2'] },
        option,
        url,
      ),
    ).toContain('\n- Question: Q26.1, Q26.2\n');
    expect(
      decisionAnswerMessage({ ...question, questions: [] }, option, url),
    ).not.toContain('Question');
  });
});
