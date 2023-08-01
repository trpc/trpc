'use client';

import { Button } from '~/components/button';
import { JsonPreTag } from '~/components/json-pretag';
import { api } from '~/trpc/client';

export function AuthThing() {
  const [me] = api.me.useSuspenseQuery();

  return (
    <div>
      <h3 className="text-lg font-semibold">Session</h3>
      <p>
        This session comes from a tRPC query. No context provider is necessary
        to authenticate your users on the server.
      </p>
      <JsonPreTag object={me} />
    </div>
  );
}

export function ClientGreeting() {
  const [greeting1] = api.greeting.useSuspenseQuery({ text: 'from react1' });
  const [greeting2] = api.greeting.useSuspenseQuery({ text: 'from react2' });
  const [secret] = api.secret.useSuspenseQuery();

  const trpcContext = api.useContext();

  return (
    <div className="space-y-2">
      <JsonPreTag object={{ greeting1, greeting2, secret }} />
      <Button onClick={() => trpcContext.greeting.invalidate()}>
        Revalidate HTTP
      </Button>
    </div>
  );
}
