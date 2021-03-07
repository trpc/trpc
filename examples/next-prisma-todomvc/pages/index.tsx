export default function Home() {
  return <></>;
}

export async function getStaticProps() {
  return {
    redirect: {
      destination: '/todos/all',
      permanent: false,
    },
  };
}
