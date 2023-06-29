import { Button } from '~/components/button';
import { JsonPreTag } from '~/components/json-pretag';
import { api } from '~/trpc/server-http';

export const ServerHttpGreeting = async () => {
  const greeting = await api.greeting.query({ text: 'from server' });
  const secret = await api.secret.query();

  return (
    <div className="space-y-2">
      <JsonPreTag object={{ greeting, secret }} />
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate({ text: 'from server' });
        }}
      >
        <Button type="submit">Revalidate HTTP</Button>
      </form>
    </div>
  );
};
