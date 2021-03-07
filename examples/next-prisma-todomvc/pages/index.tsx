export default function Home() {
  return <div />;
}

export async function getStaticProps() {
  return {
    redirect: {
      destination: '/all',
      permanent: false,
    },
  };
}
