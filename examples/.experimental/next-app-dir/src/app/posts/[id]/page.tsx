import { postById } from '../_data';

export default async function Page(props: {
  params: {
    id: string;
  };
}) {
  const post = await postById(props.params);

  return (
    <div>
      <h1>{post.title}</h1>

      <p>{post.content}</p>
    </div>
  );
}
