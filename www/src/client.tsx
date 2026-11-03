// TanStack Start's own client entry, with error hooks for Sentry.
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { reactErrorOptions } from './sentry-client.ts';
import { enableSmoothScrollOnInput } from './smooth-scroll.ts';

enableSmoothScrollOnInput();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    reactErrorOptions,
  );
});
