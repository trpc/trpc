/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { useChat } from '@ai-sdk/react';
import { trpc } from './utils/trpc';

export function Greeting() {
  const utils = trpc.useUtils();
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    fetch: (_, i) => utils.client.chat.query(JSON.parse(i!.body)),
  });

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input name="prompt" value={input} onChange={handleInputChange} />
        <button type="submit">Submit</button>
      </form>
    </>
  );
}
