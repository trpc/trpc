import { auth, signIn, signOut } from '~/lib/auth';
import { Button } from '~/ui/button';

export async function UserButton() {
  const session = await auth();
  if (session) {
    return (
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
    );
  }

  return (
    <form
      action={async () => {
        'use server';
        await signIn('github', { redirectTo: '/' });
      }}
    >
      <Button type="submit" className="px-10">
        Sign in with GitHub
      </Button>
    </form>
  );
}
