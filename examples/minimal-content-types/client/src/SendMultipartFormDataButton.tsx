import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Result } from './Result';
import { trpc } from './utils/trpc';

export function SendMultipartFormDataButton() {
  const sendFormData = trpc.formData.useMutation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>FormData</CardTitle>
        <CardDescription>
          Sends <code>multipart/form-data</code> with two fields and a file
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button
          className="self-start"
          disabled={sendFormData.status === 'pending'}
          onClick={() => {
            const fd = new FormData();

            fd.set('name', 'John Doe');
            fd.set('occupation', 'tRPC Extraordinaire');

            fd.set(
              'about',
              new File(['hi bob'], 'bob.txt', {
                type: 'text/plain',
              }),
            );

            sendFormData.mutate(fd);
          }}
        >
          Send FormData
        </Button>
        <Result mutation={sendFormData} />
      </CardContent>
    </Card>
  );
}
