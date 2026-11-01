import { createFileRoute } from '@tanstack/react-router';

import { DecisionsIndex, indexHead } from '~/components/decisions.tsx';
import { validateIndexSearch } from '~/content/decision-search.ts';
import { openQuestions } from '~/content/decisions.ts';

const areas = openQuestions.map((question) => question.area);

export const Route = createFileRoute('/v12/decisions/')({
  head: indexHead,
  component: DecisionsIndex,
  validateSearch: (search) => validateIndexSearch(search, areas),
});
