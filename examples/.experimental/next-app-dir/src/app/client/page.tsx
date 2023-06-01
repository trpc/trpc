import { ClientGreeting, ClientPost } from './ClientGreeting';
import { HydrateClient } from './HydrateClient';

export default function ClientPage() {
  return (
    <HydrateClient fallback={<>Loading....</>}>
      <ClientGreeting />

      <div
        style={{
          width: '30%',
          margin: '1rem 0',
          height: 2,
          background: 'hsla(210, 16%, 80%, 1)',
        }}
      />

      <ClientPost />
    </HydrateClient>
  );
}
