'use client';

import { signInWithCredentials, signInWithGithub } from '~/app/_actions';
import { Button } from '~/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/ui/card';
import { Input } from '~/ui/input';
import { Label } from '~/ui/label';
import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { toast } from 'sonner';

export function SignInForm() {
  const [state, signIn] = useFormState(signInWithCredentials, undefined);

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Login</CardTitle>
        <CardDescription>
          Enter your email below to login to your account.
        </CardDescription>
        <p className="text-muted-foreground border-l-3 pl-2 text-sm italic">
          New emails will auto-signup.
        </p>
      </CardHeader>
      <form action={signIn}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="johndoe@example.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
            />
          </div>
          <Button className="w-full">Sign in with Email</Button>
        </CardContent>
      </form>
      <CardFooter>
        <form className="flex w-full flex-col gap-2" action={signInWithGithub}>
          <Button type="submit" className="px-10">
            Sign in with GitHub
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
