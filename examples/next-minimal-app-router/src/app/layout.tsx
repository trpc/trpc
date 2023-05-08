import './styles.css';
import { Inter } from 'next/font/google';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`bg-background min-h-screen font-sans antialiased ${fontSans.variable}`}
      >
        <main>{props.children}</main>
      </body>
    </html>
  );
}
