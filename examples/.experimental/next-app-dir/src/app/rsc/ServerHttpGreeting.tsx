import { Button } from '~/components/button';
import { JsonPreTag } from '~/components/json-pretag';
import { api } from '~/trpc/server-http';

export const ServerHttpGreeting = async () => {
  const greeting1 = await api.greeting.query({ text: 'from server1' });
  const greeting2 = await api.greeting.query({ text: 'from server2' });
  const secret = await api.secret.query();

  return (
    <div className="space-y-2">
      <JsonPreTag object={{ greeting1, greeting2, secret }} />
      <form
        action={async () => {
          'use server';
          await api.greeting.revalidate();
        }}
      >
        <Button type="submit">Revalidate HTTP</Button>
      </form>
    </div>
  );
};
