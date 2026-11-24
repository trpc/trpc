// Stand-ins for the client-only exports in the `react-server` build. React's
// `react-server` build has no `createContext`, `useRef` and so on, so the real
// ones must stay out of that build's module graph, or bundlers fail on it
// (#6595). Like a `'use client'` reference, they throw if called on the server.
import type { createTRPCContext as createTRPCContextClient } from './Context';
import type { useSubscription as useSubscriptionClient } from './useSubscription';

function throwClientOnly(name: string): never {
  throw new Error(
    `\`${name}\` works only in client components. ` +
      "Call it from a module marked with 'use client'; in server components, use `createTRPCOptionsProxy`.",
  );
}

/**
 * `createTRPCContext` for the `react-server` export condition.
 * @internal
 */
export const createTRPCContextReactServer: typeof createTRPCContextClient =
  () => throwClientOnly('createTRPCContext');

/**
 * `useSubscription` for the `react-server` export condition.
 * @internal
 */
export const useSubscriptionReactServer: typeof useSubscriptionClient = () =>
  throwClientOnly('useSubscription');
