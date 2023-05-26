'use client';

import { use, useState } from 'react';
import { api } from 'trpc-api';

export const ClientGreeting = () => {
  const [nonce, setNonce] = useState(Math.random());
  const greeting = use(api.greeting.query({ text: 'from client' }));

  return (
    <div>
      <p>{greeting}</p>

      <button
        onClick={async () => {
          const ok = await api.greeting.revalidate({ text: 'from client' });
          console.log(ok);
          setNonce(Math.random());
        }}
      >
        Revalidate client
      </button>
    </div>
  );
};
