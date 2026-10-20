import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
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
import { Switch } from '@shared/ui/components/switch';
import { Textarea } from '@shared/ui/components/textarea';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { matchError, safe } from '@trpc12/trpc/client';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';

import { ensure, useLoaderQuery } from './loader-query.ts';
import { rootRoute } from './routes.tsx';
import { type ProfileInput, profileSchema } from './schema.ts';

export const editProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/edit',
  // The form's default values come from the loader, so it never renders empty.
  loader: async (opts) => ({
    profile: await ensure(
      opts.context.queryClient,
      opts.context.trpc.profile.get.queryOptions(),
    ),
  }),
  component: EditProfile,
});

const fields = [
  { name: 'name', label: 'Name' },
  {
    name: 'username',
    label: 'Username',
    description: 'Try admin: someone has it.',
  },
  { name: 'email', label: 'Email' },
  { name: 'topics', label: 'Topics', description: 'Separated by commas.' },
] as const;

function EditProfile(): ReactNode {
  const profile = useLoaderQuery(editProfileRoute.useLoaderData().profile);
  const ctx = editProfileRoute.useRouteContext();
  const navigate = useNavigate();
  // Off sends the form as it is, to see the server's checks.
  const [checkInBrowser, setCheckInBrowser] = useState(true);
  // #region form
  // The browser's lookup asks the server, through the query cache: a
  // username it checked once isn't asked about again.
  const [schema] = useState(() =>
    profileSchema((username) =>
      ctx.queryClient.query({
        ...ctx.trpc.profile.isTaken.queryOptions({ input: { username } }),
        staleTime: 30_000,
      }),
    ),
  );
  // `raw`: submitting hands over what the form holds, the schema's input,
  // and the server transforms it. Without it, `values` would be the output
  // (`topics` an array), which `mutate()` doesn't take.
  const resolver = standardSchemaResolver(schema, undefined, { raw: true });
  const form = useForm<ProfileInput>({
    resolver: (values, context, options) =>
      checkInBrowser
        ? resolver(values, context, options)
        : { values, errors: {} },
    // After a failed submit, fields check again on blur, not every key.
    reValidateMode: 'onBlur',
    defaultValues: {
      name: profile.name,
      username: profile.username,
      email: profile.email,
      // The output back into the input: what the field shows.
      topics: profile.topics.join(', '),
      bio: profile.bio,
    },
  });

  const save = form.handleSubmit(async (values) => {
    const [saved, err] = await safe(ctx.client.profile.update.mutate(values));
    if (err) {
      // One handler per way the call can fail, inferred from the server.
      matchError(err, {
        // The schema's issues, the server's username lookup's too, with
        // paths typed from its input.
        BAD_REQUEST: (e) => {
          for (const issue of e.data.issues) {
            form.setError(issue.path[0] ?? 'root.server', {
              message: issue.message,
            });
          }
        },
        NETWORK_ERROR: () =>
          form.setError('root.server', {
            message: "Couldn't reach the server. Try again.",
          }),
        BAD_RESPONSE: () =>
          form.setError('root.server', { message: 'Try again later.' }),
        unexpected: (e) => form.setError('root.server', { message: e.message }),
      });
      return;
    }
    ctx.queryClient.setQueryData(ctx.trpc.profile.get.queryKey(), saved);
    await ctx.queryClient.invalidateQueries(
      ctx.trpc.profile.changes.queryFilter(),
    );
    await navigate({ to: '/' });
  });
  // #endregion form

  const errors = form.formState.errors;
  return (
    <form className="grid gap-5" noValidate onSubmit={save}>
      <FieldGroup className="gap-4">
        {fields.map((field) => (
          <Field data-invalid={!!errors[field.name]} key={field.name}>
            <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
            <Input
              aria-invalid={!!errors[field.name]}
              id={field.name}
              {...form.register(field.name)}
            />
            {'description' in field && !errors[field.name] ? (
              <FieldDescription>{field.description}</FieldDescription>
            ) : null}
            <FieldError errors={[errors[field.name]]} />
          </Field>
        ))}
        <Field data-invalid={!!errors.bio}>
          <FieldLabel htmlFor="bio">Bio</FieldLabel>
          <Textarea
            aria-invalid={!!errors.bio}
            id="bio"
            rows={2}
            {...form.register('bio')}
          />
          <FieldError errors={[errors.bio]} />
        </Field>
      </FieldGroup>
      {errors.root?.server ? (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch
            checked={checkInBrowser}
            onCheckedChange={setCheckInBrowser}
            size="sm"
          />
          Check in the browser too
        </label>
      </div>
    </form>
  );
}
