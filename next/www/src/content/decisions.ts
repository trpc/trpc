import { notFound } from '@tanstack/react-router';
import { decisionRecords, openQuestions } from 'virtual:decisions-manifest';

import type { Decision, OpenQuestion } from './decision-types.ts';

export { decisionRecords, openQuestions };

const openFiles = import.meta.glob<{ default: OpenQuestion }>([
  '../../../.agent-docs/open/*.md',
  '!../../../.agent-docs/open/README.md',
]);

const recordFiles = import.meta.glob<{ default: Decision }>(
  '../../../.agent-docs/decisions/*.md',
);

export function findOpenQuestion(slug: string) {
  return openQuestions.find((question) => question.slug === slug);
}

export function findDecision(slug: string) {
  return decisionRecords.find((decision) => decision.slug === slug);
}

/** An open question, compiled at build time, or a 404. */
export async function loadOpenQuestion(slug: string) {
  const load = openFiles[`../../../.agent-docs/open/${slug}.md`];
  if (!load || !findOpenQuestion(slug)) {
    throw notFound();
  }
  return (await load()).default;
}

/** A decision, compiled at build time, or a 404. */
export async function loadDecision(slug: string) {
  const load = recordFiles[`../../../.agent-docs/decisions/${slug}.md`];
  if (!load || !findDecision(slug)) {
    throw notFound();
  }
  return (await load()).default;
}
