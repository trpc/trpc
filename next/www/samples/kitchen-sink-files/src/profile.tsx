import { Alert, AlertDescription } from '@shared/ui/components/alert';
import { Button } from '@shared/ui/components/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Skeleton } from '@shared/ui/components/skeleton';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createRootRouteWithContext } from '@tanstack/react-router';
import { matchError } from '@trpc12/trpc/client';
import { type ReactNode, useState } from 'react';

import { drawAvatar, drawNoise, useObjectUrl } from './images.ts';
import type { AppContext } from './trpc.ts';

export const rootRoute = createRootRouteWithContext<AppContext>()({
  loader: (opts) =>
    opts.context.queryClient.query({
      ...opts.context.trpc.profile.get.queryOptions(),
      staleTime: 'static',
    }),
  component: Profile,
});

type Errors = Partial<Record<'avatar' | 'name' | 'form', string>>;

function Profile(): ReactNode {
  const ctx = rootRoute.useRouteContext();
  const profile = useSuspenseQuery(ctx.trpc.profile.get.queryOptions()).data;
  // #region avatar
  // `data` is the `File` the procedure returned: its bytes were the
  // response's body.
  const avatar = useQuery(ctx.trpc.profile.avatar.queryOptions()).data;
  const avatarUrl = useObjectUrl(avatar);
  // #endregion avatar
  const [name, setName] = useState(profile.name);
  const [file, setFile] = useState<File>();
  const fileUrl = useObjectUrl(file);
  const [errors, setErrors] = useState<Errors>({});
  const update = useMutation(ctx.trpc.profile.update.mutationOptions());

  // #region save
  const save = () => {
    setErrors({});
    // The `File` goes in the input as it is.
    update.mutate(
      { name, avatar: file },
      {
        onSuccess: async () => {
          setFile(undefined);
          await ctx.queryClient.invalidateQueries(
            ctx.trpc.profile.pathFilter(),
          );
        },
        onError: (err) =>
          matchError(err, {
            // The server's checks of the file, on its field: `path` is
            // typed from the input.
            BAD_REQUEST: (e) =>
              setErrors(
                Object.fromEntries(
                  e.data.issues.map((issue) => [
                    issue.path[0] ?? 'form',
                    issue.message,
                  ]),
                ),
              ),
            NETWORK_ERROR: () =>
              setErrors({ form: "Couldn't reach the server. Try again." }),
            BAD_RESPONSE: () => setErrors({ form: 'Try again later.' }),
            unexpected: (e) => setErrors({ form: e.message }),
          }),
      },
    );
  };
  // #endregion save

  const pick = (next: File | undefined) => {
    setErrors({});
    setFile(next);
  };
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          <img
            alt={`${profile.name}'s avatar`}
            className="size-14 rounded-full object-cover"
            src={avatarUrl}
          />
        ) : (
          <Skeleton className="size-14 rounded-full" />
        )}
        <div className="grid">
          <span className="font-semibold">{profile.name}</span>
          <span className="text-xs text-muted-foreground">
            {profile.avatar.name}, {(profile.avatar.size / 1024).toFixed(1)} kB
          </span>
        </div>
      </div>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <FieldGroup className="gap-4">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              aria-invalid={!!errors.name}
              id="name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <FieldError>{errors.name}</FieldError>
          </Field>
          <Field data-invalid={!!errors.avatar}>
            <FieldLabel htmlFor="avatar">Avatar</FieldLabel>
            <div className="flex items-center gap-3">
              {fileUrl && file?.type.startsWith('image/') ? (
                <img
                  alt="The new avatar"
                  className="size-10 rounded-full object-cover"
                  src={fileUrl}
                />
              ) : null}
              <Input
                accept="image/*"
                aria-invalid={!!errors.avatar}
                // A new element for each file picked here or below, so it
                // shows no stale name.
                id="avatar"
                key={file?.name ?? 'none'}
                onChange={(event) => pick(event.target.files?.[0])}
                type="file"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                onClick={async () => pick(await drawAvatar(name.charAt(0)))}
                size="xs"
                type="button"
                variant="outline"
              >
                Draw one
              </Button>
              <Button
                onClick={async () => pick(await drawNoise())}
                size="xs"
                type="button"
                variant="outline"
              >
                Too big
              </Button>
              <Button
                onClick={() =>
                  pick(
                    new File(['Not a picture.'], 'notes.txt', {
                      type: 'text/plain',
                    }),
                  )
                }
                size="xs"
                type="button"
                variant="outline"
              >
                Not an image
              </Button>
            </div>
            {file && !errors.avatar ? (
              <FieldDescription>
                {file.name}, {file.type || 'no type'},{' '}
                {(file.size / 1024).toFixed(1)} kB
              </FieldDescription>
            ) : null}
            <FieldError>{errors.avatar}</FieldError>
          </Field>
        </FieldGroup>
        {errors.form ? (
          <Alert variant="destructive">
            <AlertDescription>{errors.form}</AlertDescription>
          </Alert>
        ) : null}
        <Button className="w-fit" disabled={update.isPending} type="submit">
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </div>
  );
}
