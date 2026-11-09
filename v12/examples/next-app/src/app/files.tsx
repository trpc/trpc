'use client';
import { Button } from '@shared/ui/components/button';
import { Input } from '@shared/ui/components/input';
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
    <div className="flex flex-col items-start gap-4">
      <Input
        type="file"
        aria-label="Upload a file"
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
      <Button variant="outline" onClick={() => void download.refetch()}>
        Download report.txt
      </Button>
      {download.data && (
        <a
          className="text-primary underline-offset-4 hover:underline"
          href={URL.createObjectURL(download.data)}
          download={download.data.name}
        >
          Save {download.data.name}
        </a>
      )}
    </div>
  );
}
