'use client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import { Field, FieldGroup, FieldLabel } from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { Textarea } from '@shared/ui/components/textarea';
import { useActionState, useOptimistic } from 'react';
import type { Entry } from '../../server/router.ts';
import { sign } from './actions.ts';

type SignState = Awaited<ReturnType<typeof sign>> | undefined;
type Shown = Entry & { pending?: true };

export function Entries(props: { entries: Entry[] }) {
  const [state, submit, isPending] = useActionState<SignState, FormData>(
    sign,
    undefined,
  );
  // Shows the submission until the action's refreshed page arrives.
  const [shown, addShown] = useOptimistic<Shown[], Shown>(
    props.entries,
    (list, entry) => [...list, entry],
  );
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2" data-testid="entries">
        {shown.map((entry) => (
          <li
            key={entry.id}
            data-pending={entry.pending}
            className="flex items-baseline gap-2 data-pending:opacity-60"
          >
            <span className="font-medium">{entry.name}</span>
            <span>{entry.message}</span>
            {entry.pending && <Badge variant="secondary">sending</Badge>}
          </li>
        ))}
      </ul>
      <form
        action={(form) => {
          addShown({
            id: 'pending',
            name: form.get('name') as string,
            message: form.get('message') as string,
            createdAt: new Date(),
            pending: true,
          });
          submit(form);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="guestbook-name">Name</FieldLabel>
            <Input id="guestbook-name" name="name" required maxLength={40} />
          </Field>
          <Field>
            <FieldLabel htmlFor="guestbook-message">Message</FieldLabel>
            <Textarea
              id="guestbook-message"
              name="message"
              required
              maxLength={280}
            />
          </Field>
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending && <Spinner />}
            Sign
          </Button>
        </FieldGroup>
      </form>
      {state?.error && (
        <Alert variant="destructive" data-testid="sign-error">
          <AlertTitle>{state.error.code}</AlertTitle>
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
