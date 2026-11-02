import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Button } from '@shared/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui/components/dialog';
import { Field, FieldLabel } from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';
import { useTRPC } from '~/lib/trpc';

export function CreateChannelDialog() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const createChannel = useMutation(
    trpc.channel.create.mutationOptions({
      onSuccess: async (id) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.channel.list.queryKey(),
        });
        setOpen(false);
        await navigate({
          to: '/channels/$channelId',
          params: { channelId: id },
        });
      },
    }),
  );
  const pending = createChannel.status === 'pending';

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          createChannel.reset();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="icon-sm" variant="outline" aria-label="New channel" />
        }
      >
        <PlusIcon />
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get('name') as string;
            createChannel.mutate({ name });
          }}
        >
          <DialogHeader>
            <DialogTitle>New channel</DialogTitle>
            <DialogDescription>
              Everyone sees it in the channel list straight away.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="channel-name">Name</FieldLabel>
            <Input
              id="channel-name"
              type="text"
              name="name"
              placeholder="general"
              required
              minLength={2}
              autoFocus
            />
          </Field>
          {createChannel.status === 'error' && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Couldn&apos;t create the channel</AlertTitle>
              <AlertDescription>{createChannel.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
