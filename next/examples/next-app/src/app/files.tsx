'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTrpc } from '../trpc/client.tsx';

export function Files() {
  const trpc = useTrpc();
  const upload = useMutation(trpc.files.upload.mutationOptions());
  const download = useQuery({
    ...trpc.files.download.queryOptions({ input: { name: 'report' } }),
    enabled: false,
  });
  return (
    <section>
      <h2>Files</h2>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate({ file });
        }}
      />
      {upload.data && (
        <p>
          {upload.data.name}: {upload.data.size} bytes, “{upload.data.preview}”
        </p>
      )}
      <button onClick={() => void download.refetch()}>
        Download report.txt
      </button>
      {download.data && (
        <a
          href={URL.createObjectURL(download.data)}
          download={download.data.name}
        >
          Save {download.data.name}
        </a>
      )}
    </section>
  );
}
