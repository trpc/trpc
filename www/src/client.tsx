// TanStack Start's own client entry, with error hooks for Sentry.
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { reactErrorOptions } from './sentry-client.ts';

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    reactErrorOptions,
  );
});
