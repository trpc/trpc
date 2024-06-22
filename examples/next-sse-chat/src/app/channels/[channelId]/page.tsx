import { Suspense } from 'react';
import { Chat } from './chat';

export default async function Home(
  props: Readonly<{ params: { channelId: string } }>,
) {
  const channelId = props.params.channelId;

  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-1 flex-row items-center justify-center italic">
          Loading....
        </div>
      }
    >
      <Chat channelId={channelId} />
    </Suspense>
  );
}
