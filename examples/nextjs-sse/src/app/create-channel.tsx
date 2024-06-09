'use client';

import { Button } from '~/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTrigger,
} from '~/components/dialog';
import { Input } from '~/components/input';
import { trpc } from '~/lib/trpc';
import { useRouter } from 'next/navigation';

export function CreateChannelForm() {
  const router = useRouter();
  const { mutate: createChannel } = trpc.channel.create.useMutation({
    onSuccess: (id) => {
      router.push(`/channels/${id}`);
      router.refresh();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = new FormData(e.currentTarget).get('name') as string;
        createChannel({ name });
      }}
      className="flex max-w-md gap-2"
    >
      <Input type="text" name="name" placeholder="Create New Channel" />
      <Button>Create New Channel</Button>
    </form>
  );
}

export function CreateChannelDialog(
  props: Readonly<{ children?: React.ReactNode }>,
) {
  return (
    <Dialog>
      <DialogTrigger asChild>{props.children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>Create New Channel</DialogHeader>
        <DialogDescription>
          <p>Create a new channel</p>
        </DialogDescription>
        <CreateChannelForm />
      </DialogContent>
    </Dialog>
  );
}
