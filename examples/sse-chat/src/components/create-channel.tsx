import * as Headless from '@headlessui/react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '~/components/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '~/components/dialog';
import { Input, Label } from '~/components/input';
import { useTRPC } from '~/lib/trpc';
import * as React from 'react';

export function CreateChannelDialog() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
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
      onError(err) {
        alert('Error: ' + err.message);
      },
    }),
  );

  return (
    <>
      <Button size="icon" className="!size-8" onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Create New Channel</DialogTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get('name') as string;
            mutation.mutate({ name });
          }}
        >
          <DialogBody>
            <Headless.Field>
              <Label className="text-sm/6 font-medium">Name</Label>
              <Input
                type="text"
                name="name"
                placeholder="general"
                className="w-full"
              />
            </Headless.Field>
          </DialogBody>
          <DialogActions>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={mutation.isPending}
            >
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
