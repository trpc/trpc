import { createFileRoute } from '@tanstack/react-router';

import { DocsLayout } from '~/components/doc-page.tsx';

export const Route = createFileRoute('/docs_/v10')({
  component: DocsLayout,
});
