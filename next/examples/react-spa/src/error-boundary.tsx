import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { CircleAlertIcon } from 'lucide-react';
import { Component, type ReactNode } from 'react';

/** Shows a failed Suspense query (an issue deleted elsewhere: NOT_FOUND). */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Couldn't load this issue</AlertTitle>
        <AlertDescription>{this.state.error.message}</AlertDescription>
      </Alert>
    );
  }
}
