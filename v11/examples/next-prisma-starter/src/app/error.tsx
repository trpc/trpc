'use client';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Button } from '@shared/ui/components/button';
import { CircleAlertIcon } from 'lucide-react';

/**
 * Shown when a page's server render fails, such as a query it waits for
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
export default function ErrorPage(props: { error: Error; reset: () => void }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{props.error.message}</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={props.reset}>
          Try again
        </Button>
      </AlertAction>
    </Alert>
  );
}
