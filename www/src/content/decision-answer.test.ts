import { describe, expect, it } from '@effect/vitest';

import {
  type DecisionAnswer,
  decisionAnswerMessage,
} from './decision-answer.ts';

const question: DecisionAnswer['question'] = {
  options: [
    { cons: '', html: '', id: 'A', pros: '', title: 'No infinite handles' },
    {
      cons: '',
      html: '',
      id: 'B',
      pros: '',
      title: 'The reader passes the input function again',
    },
    {
      cons: '',
      html: '',
      id: 'C',
      pros: '',
      title: 'The handle carries the input without its page param',
    },
  ],
  path: 'next/.agent-docs/open/tanstack-infinite-handles.md',
  recommended: 'C',
  slug: 'tanstack-infinite-handles',
  title:
    'How should an infinite query get a serializable handle, now that its input is a function?',
};

const base: DecisionAnswer = {
  answer: 'C',
  note: '',
  question,
  questionIds: ['Q19.3'],
  url: 'https://v12.trpc.io/v12/decisions/open/tanstack-infinite-handles',
};

describe('decisionAnswerMessage', () => {
  it('names the question, its file and the recommended answer', () => {
    expect(decisionAnswerMessage(base)).toBe(
      [
        'Decision answer for tanstack-infinite-handles (Q19.3): C, the recommended option.',
        '',
        '- Decision: How should an infinite query get a serializable handle, now that its input is a function?',
        '- File: `next/.agent-docs/open/tanstack-infinite-handles.md`',
        '- Question: Q19.3',
        '- Answer: C) The handle carries the input without its page param',
        '- Recommended: yes',
        '- Page: https://v12.trpc.io/v12/decisions/open/tanstack-infinite-handles',
      ].join('\n'),
    );
  });

  it('says which option was recommended when another is chosen, and quotes the note on one line', () => {
    expect(
      decisionAnswerMessage({
        ...base,
        answer: 'A',
        note: '  Not worth it\n   for now.  ',
      }),
    ).toBe(
      [
        'Decision answer for tanstack-infinite-handles (Q19.3): A, not the recommended option (C).',
        '',
        '- Decision: How should an infinite query get a serializable handle, now that its input is a function?',
        '- File: `next/.agent-docs/open/tanstack-infinite-handles.md`',
        '- Question: Q19.3',
        '- Answer: A) No infinite handles',
        '- Recommended: no, the recommendation is C) The handle carries the input without its page param',
        '- Note: "Not worth it for now."',
        '- Page: https://v12.trpc.io/v12/decisions/open/tanstack-infinite-handles',
      ].join('\n'),
    );
  });

  it('defers a skip, keeping the note', () => {
    expect(
      decisionAnswerMessage({ ...base, answer: 'skip', note: 'After 12.1' }),
    ).toBe(
      [
        'Decision skipped for tanstack-infinite-handles (Q19.3): leave it open for a later round.',
        '',
        '- Decision: How should an infinite query get a serializable handle, now that its input is a function?',
        '- File: `next/.agent-docs/open/tanstack-infinite-handles.md`',
        '- Question: Q19.3',
        "- Answer: skip. Defer it: leave the open file as it is for a later round; don't make the call or record anything.",
        '- Note: "After 12.1"',
        '- Page: https://v12.trpc.io/v12/decisions/open/tanstack-infinite-handles',
      ].join('\n'),
    );
  });

  it('lists several questions, and none when the page cites none', () => {
    const several = decisionAnswerMessage({
      ...base,
      questionIds: ['Q26.1', 'Q26.2'],
    });
    expect(several).toContain(
      'Decision answer for tanstack-infinite-handles (Q26.1, Q26.2):',
    );
    expect(several).toContain('\n- Questions: Q26.1, Q26.2\n');

    const none = decisionAnswerMessage({ ...base, questionIds: [] });
    expect(none).toMatch(/^Decision answer for tanstack-infinite-handles: C,/);
    expect(none).not.toContain('Question');
  });
});
