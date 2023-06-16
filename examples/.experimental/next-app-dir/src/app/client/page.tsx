import { Suspense, use } from 'react';
import { ClientGreeting } from './ClientGreeting';

export default function ClientPage() {
  return (
    <Suspense>
      <ClientGreeting />
    </Suspense>
  );
}
