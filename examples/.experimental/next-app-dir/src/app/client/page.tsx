import { ClientGreeting } from './ClientGreeting';
import { HydrateClient } from './HydrateClient';

export default function ClientPage() {
  return (
    <HydrateClient fallback={<>Loading....</>}>
      <ClientGreeting />
    </HydrateClient>
  );
}
