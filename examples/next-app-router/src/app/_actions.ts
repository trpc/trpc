'use server';

import { signIn } from '~/auth';
import { AuthError } from 'next-auth';
import { isRedirectError } from 'next/dist/client/components/redirect';

export async function signInWithCredentials(
  _prevState: { error: string } | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    isRedirectError(error);

    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid credentials.' };
        default:
          return { error: 'Something went wrong.' };
      }
    }
    console.error('Uncaught error signing in', error);
    throw error;
  }
}

export async function signInWithGithub() {
  return signIn('github', { redirectTo: '/' });
}
