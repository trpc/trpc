import { auth, signOut } from '~/auth';
import { Button } from '~/ui/button';
import { SignInForm } from './sign-in-form';

export async function UserButton() {
  const session = await auth();
  if (session) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <span>Welcome back, {session.user.name}!</span>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <Button type="submit" className="px-10">
            Sign Out
          </Button>
        </form>
      </div>
    );
  }

  return <SignInForm />;
}
