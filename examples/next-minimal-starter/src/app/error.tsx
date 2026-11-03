'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { CircleAlertIcon } from 'lucide-react';

export default function ErrorPage(props: { error: Error }) {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{props.error.message}</AlertDescription>
      </Alert>
    </main>
  );
}
