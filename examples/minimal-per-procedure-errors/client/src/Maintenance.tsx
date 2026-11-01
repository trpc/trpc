import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { useQuery } from '@tanstack/react-query';
import { Result } from './Result';
import { trpc } from './utils/trpc';

/**
 * The `maintenance` procedure registers its `.errors()` handler *before* the
 * middleware that throws, which is the only order that works - a handler never
 * sees errors thrown above it in the chain.
 */
export function Maintenance() {
  const maintenanceQuery = useQuery(trpc.maintenance.queryOptions());

  function result() {
    switch (maintenanceQuery.status) {
      case 'pending':
        return 'loading...';
      case 'success':
        return maintenanceQuery.data;
      case 'error': {
        const data = maintenanceQuery.error.data;
        if (!data) {
          return maintenanceQuery.error.message;
        }

        if (!('kind' in data)) {
          return `Formatted by the ${data.handledBy} instead`;
        }

        return `Down for maintenance until ${data.until}`;
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <code>maintenance</code>
        </CardTitle>
        <CardDescription>
          A throwing middleware, caught by the handler registered ahead of it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Result
          testId="maintenance-result"
          tone={maintenanceQuery.status === 'error' ? 'error' : 'default'}
        >
          {result()}
        </Result>
      </CardContent>
    </Card>
  );
}
