import Link from 'next/link';

export default function AboutPage() {
  return (
    <div>
      Some text
      <Link href="/">
        <a>Index</a>
      </Link>
    </div>
  );
}
