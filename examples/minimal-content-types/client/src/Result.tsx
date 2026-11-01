import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Spinner } from '@shared/ui/components/spinner';
import { CircleAlertIcon } from 'lucide-react';

type MutationState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'error'; error: { message: string } }
  | { status: 'success'; data: unknown };

export function Result(props: { mutation: MutationState }) {
  switch (props.mutation.status) {
    case 'idle':
      return <p className="text-sm text-muted-foreground">No response yet.</p>;
    case 'pending':
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Sending…
        </p>
      );
    case 'error':
      return (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>The request failed</AlertTitle>
          <AlertDescription>{props.mutation.error.message}</AlertDescription>
        </Alert>
      );
    case 'success':
      return (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(props.mutation.data, null, 2)}
        </pre>
      );
  }
}
