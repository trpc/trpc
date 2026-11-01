import { createFileRoute } from '@tanstack/react-router';

import { DocsLayout } from '~/components/doc-page.tsx';

export const Route = createFileRoute('/v10/docs')({
  component: DocsLayout,
});
