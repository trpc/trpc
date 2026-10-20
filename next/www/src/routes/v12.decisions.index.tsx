import { createFileRoute } from '@tanstack/react-router';

import { DecisionsIndex, indexHead } from '~/components/decisions.tsx';

export const Route = createFileRoute('/v12/decisions/')({
  head: indexHead,
  component: DecisionsIndex,
});
