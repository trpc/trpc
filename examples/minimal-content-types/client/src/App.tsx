import { QueryClientProvider } from '@tanstack/react-query';
import { SendFileButton } from './SendFileButton';
import { SendMultipartFormDataButton } from './SendMultipartFormDataButton';
import { queryClient } from './utils/trpc';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          width: '10rem',
        }}
      >
        <SendMultipartFormDataButton />

        <SendFileButton />
      </div>
    </QueryClientProvider>
  );
}
