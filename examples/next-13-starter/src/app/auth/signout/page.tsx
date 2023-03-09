import { SignOut } from '~/app/auth-actions';

export default function SignInPage() {
  return (
    <SignOut>
      <a className="bg-gray-800 px-5 py-3 rounded tracking">Sign Out</a>
    </SignOut>
  );
}
