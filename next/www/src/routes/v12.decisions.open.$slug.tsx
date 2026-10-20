import { createFileRoute } from '@tanstack/react-router';

import { OpenQuestionPage, openQuestionHead } from '~/components/decisions.tsx';
import { validateOpenQuestionSearch } from '~/content/decision-search.ts';
import { loadOpenQuestion } from '~/content/decisions.ts';

export const Route = createFileRoute('/v12/decisions/open/$slug')({
  loader: async (args) => ({
    question: await loadOpenQuestion(args.params.slug),
  }),
  head: (args) => openQuestionHead(args.params.slug),
  component: () => (
    <OpenQuestionPage question={Route.useLoaderData().question} />
  ),
  validateSearch: validateOpenQuestionSearch,
});
