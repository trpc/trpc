import Link from 'next/link';

export default function Index() {
  return (
    <ul
      style={{
        listStyle: 'disc',
        listStylePosition: 'inside',
        padding: 0,
      }}
    >
      <li>
        <Link
          href="/rsc"
          style={{
            color: 'hsla(210, 16%, 80%, 1)',
          }}
        >
          React Server Components
        </Link>
      </li>
      <li>
        <Link
          href="/server-action"
          style={{
            color: 'hsla(210, 16%, 80%, 1)',
          }}
        >
          Server Action
        </Link>
      </li>
    </ul>
  );
}
