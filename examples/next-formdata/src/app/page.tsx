import Link from 'next/link';

export default function IndexPage() {
  return (
    <ul>
      <li>
        <Link href="/vanilla">/vanilla</Link>
      </li>
      <li>
        <Link href="/react-hook-form">/react-hook-form</Link>
      </li>
    </ul>
  );
}
