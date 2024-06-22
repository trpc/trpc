import { Chat } from './chat';

export default async function Home(
  props: Readonly<{ params: { channelId: string } }>,
) {
  const channelId = props.params.channelId;

  return <Chat channelId={channelId} key={channelId} />;
}
