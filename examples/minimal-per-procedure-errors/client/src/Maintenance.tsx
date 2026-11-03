import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

/**
 * The `maintenance` procedure registers its `.errors()` handler *before* the
 * middleware that throws, which is the only order that works - a handler never
 * sees errors thrown above it in the chain.
 */
export function Maintenance() {
  const maintenance = useQuery(trpc.maintenance.queryOptions());

  function result() {
    if (maintenance.isPending) {
      return 'loading...';
    }

    const data = maintenance.error?.data;
    if (!data) {
      return maintenance.data ?? 'no error';
    }

    if (!('kind' in data)) {
      return `Formatted by the ${data.handledBy} instead`;
    }

    return `Down for maintenance until ${data.until}`;
  }

  return (
    <section>
      <h2>
        <code>maintenance</code>
      </h2>
      <p>
        A throwing middleware, caught by the handler registered ahead of it.
      </p>
      <pre data-testid="maintenance-result">{result()}</pre>
    </section>
  );
}
