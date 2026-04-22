import type { ViewRef } from 'react-fate';
import { useRequest, useView, view } from 'react-fate';
import type { Greeting as GreetingEntity } from '../../server';

const GreetingView = view<GreetingEntity>()({
  id: true,
  message: true,
  recipient: true,
});

function GreetingCard({ greetingRef }: { greetingRef: ViewRef<'Greeting'> }) {
  const greeting = useView(GreetingView, greetingRef);

  if (!greeting) {
    return null;
  }

  return (
    <section
      style={{
        border: '1px solid #d4d4d8',
        borderRadius: 12,
        display: 'grid',
        gap: 8,
        padding: 20,
      }}
    >
      <p
        style={{
          color: '#71717a',
          fontSize: 14,
          margin: 0,
          textTransform: 'uppercase',
        }}
      >
        Requested recipient
      </p>
      <h1 style={{ fontSize: 32, margin: 0 }}>{greeting.message}</h1>
      <p style={{ color: '#52525b', margin: 0 }}>
        Fate resolves a typed `viewer` root and masks the component to the exact
        fields selected here for {greeting.recipient}.
      </p>
    </section>
  );
}

export function Greeting() {
  const { viewer } = useRequest({
    viewer: {
      args: { name: 'tRPC user' },
      view: GreetingView,
    },
  });

  return <GreetingCard greetingRef={viewer} />;
}
