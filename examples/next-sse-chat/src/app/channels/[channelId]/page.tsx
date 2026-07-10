import { Suspense } from 'react';
import { Chat } from './chat';

export default async function Home(
  props: Readonly<{ params: Promise<{ channelId: string }> }>,
) {
  const { channelId } = await props.params;

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
