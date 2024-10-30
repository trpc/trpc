import { postById } from '../_data';

export default async function Page(props: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await props.params;
  const post = await postById({ id });

  return (
    <div>
      <h1>{post.title}</h1>

      <p>{post.content}</p>
    </div>
  );
}
