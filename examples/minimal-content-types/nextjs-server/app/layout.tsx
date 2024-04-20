import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Next.js App API',
  description: 'Just serves a tRPC Router with the fetch adapter',
};

export default function RootLayout(
  props: Readonly<{
    children: React.ReactNode;
  }>,
) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  );
}
