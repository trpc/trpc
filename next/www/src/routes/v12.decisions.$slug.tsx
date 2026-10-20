import { createFileRoute } from '@tanstack/react-router';

import { DecisionPage, decisionHead } from '~/components/decisions.tsx';
import { loadDecision } from '~/content/decisions.ts';

export const Route = createFileRoute('/v12/decisions/$slug')({
  loader: async (args) => ({ decision: await loadDecision(args.params.slug) }),
  head: (args) => decisionHead(args.params.slug),
  component: () => <DecisionPage decision={Route.useLoaderData().decision} />,
});
