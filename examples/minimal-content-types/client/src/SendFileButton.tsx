import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Input } from '@shared/ui/components/input';
import { Label } from '@shared/ui/components/label';
import { Result } from './Result';
import { trpc } from './utils/trpc';

export function SendFileButton() {
  const sendFile = trpc.file.useMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>File</CardTitle>
        <CardDescription>
          Sends the file as <code>application/octet-stream</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">Send File</Label>
          <Input
            id="file"
            type="file"
            disabled={sendFile.status === 'pending'}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                // oxlint-disable-next-line typescript/no-non-null-assertion
                const file = e.target.files.item(0)!;
                console.log('uploading file', file);

                // TODO: type inference needs sorting out ion one way or another
                sendFile.mutate(file);
              }
            }}
          />
        </div>
        <Result mutation={sendFile} />
      </CardContent>
    </Card>
  );
}
