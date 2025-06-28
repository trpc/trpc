'use client';

import { buttonVariants } from '@/components/ui/button';
import type { ProvideLinksToolSchema } from '@/lib/chat/inkeep-qa-schema';
import { cn } from '@/lib/cn';
import { useChat, type Message, type UseChatHelpers } from '@ai-sdk/react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  type DialogProps,
} from '@radix-ui/react-dialog';
import Link from 'fumadocs-core/link';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Loader2, RefreshCw, Send, X } from 'lucide-react';
import {
  Children,
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import type { z } from 'zod';
import { createProcessor, type Processor } from './markdown-processor';

const ChatContext = createContext<UseChatHelpers | null>(null);
function useChatContext() {
  return use(ChatContext)!;
}

function SearchAIActions() {
  const { messages, status, setMessages, reload } = useChatContext();
  const isLoading = status === 'streaming';

  if (messages.length === 0) return null;
  return (
    <div className="from-fd-popover sticky bottom-0 flex flex-row items-center justify-end gap-2 bg-gradient-to-t px-3 py-1.5 empty:hidden">
      {!isLoading && messages.at(-1)?.role === 'assistant' && (
        <button
          type="button"
          className={cn(
            buttonVariants({
              color: 'secondary',
            }),
            'text-fd-muted-foreground gap-1.5 rounded-full',
          )}
          onClick={() => reload()}
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      )}
      <button
        type="button"
        className={cn(
          buttonVariants({
            color: 'secondary',
          }),
          'text-fd-muted-foreground rounded-full',
        )}
        onClick={() => setMessages([])}
      >
        Clear Chat
      </button>
    </div>
  );
}

function SearchAIInput(props: FormHTMLAttributes<HTMLFormElement>) {
  const { status, input, setInput, handleSubmit, stop } = useChatContext();
  const isLoading = status === 'streaming' || status === 'submitted';
  const onStart = (e?: React.FormEvent) => {
    e?.preventDefault();
    handleSubmit(e);
  };

  useEffect(() => {
    if (isLoading) document.getElementById('nd-ai-input')?.focus();
  }, [isLoading]);

  return (
    <form
      {...props}
      className={cn(
        'flex items-start pe-2 transition-colors',
        isLoading && 'bg-fd-muted',
        props.className,
      )}
      onSubmit={onStart}
    >
      <Input
        value={input}
        placeholder={isLoading ? 'AI is answering...' : 'Ask AI something'}
        disabled={status === 'streaming' || status === 'submitted'}
        onChange={(e) => {
          setInput(e.target.value);
        }}
        onKeyDown={(event) => {
          if (!event.shiftKey && event.key === 'Enter') {
            onStart();
            event.preventDefault();
          }
        }}
      />
      {isLoading ? (
        <button
          type="button"
          className={cn(
            buttonVariants({
              color: 'secondary',
              className: 'mt-2 gap-2 rounded-full',
            }),
          )}
          onClick={stop}
        >
          <Loader2 className="text-fd-muted-foreground size-4 animate-spin" />
          Abort Answer
        </button>
      ) : (
        <button
          type="submit"
          className={cn(
            buttonVariants({
              color: 'ghost',
              className: 'mt-2 rounded-full p-1.5',
            }),
          )}
          disabled={input.length === 0}
        >
          <Send className="size-4" />
        </button>
      )}
    </form>
  );
}

function List(props: Omit<HTMLAttributes<HTMLDivElement>, 'dir'>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    function callback() {
      const container = containerRef.current;
      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'instant',
      });
    }

    const observer = new ResizeObserver(callback);
    callback();

    const element = containerRef.current?.firstElementChild;

    if (element) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      {...props}
      className={cn(
        'fd-scroll-container flex max-h-[calc(100dvh-240px)] min-w-0 flex-col overflow-y-auto',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}

function Input(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const shared = cn('col-start-1 row-start-1 max-h-60 min-h-12 p-3');

  return (
    <div className="grid flex-1">
      <textarea
        id="nd-ai-input"
        className={cn(
          shared,
          'placeholder:text-fd-muted-foreground resize-none bg-transparent focus-visible:outline-none',
        )}
        {...props}
      />
      <div ref={ref} className={cn(shared, 'invisible break-all')}>
        {`${props.value?.toString() ?? ''}\n`}
      </div>
    </div>
  );
}

let processor: Processor | undefined;
const map = new Map<string, ReactNode>();

const roleName: Record<string, string> = {
  user: 'you',
  assistant: 'fumadocs',
};

function Message({ message }: { message: Message }) {
  const { parts } = message;
  let links: z.infer<typeof ProvideLinksToolSchema>['links'] = [];

  for (const part of parts ?? []) {
    if (part.type !== 'tool-invocation') continue;

    if (part.toolInvocation.toolName === 'provideLinks') {
      links = part.toolInvocation.args.links;
    }
  }

  return (
    <div>
      <p
        className={cn(
          'text-fd-muted-foreground mb-1 text-xs font-medium',
          message.role === 'assistant' && 'text-fd-primary',
        )}
      >
        {roleName[message.role] ?? 'unknown'}
      </p>
      <div className="prose text-sm">
        <Markdown text={message.content} />
      </div>
      {links && links.length > 0 ? (
        <div className="mt-2 flex flex-row flex-wrap items-center gap-1">
          {links.map((item, i) => (
            <Link
              key={i}
              href={item.url}
              className="hover:bg-fd-accent hover:text-fd-accent-foreground block rounded-lg border p-3 text-xs"
            >
              <p className="font-medium">{item.title}</p>
              <p className="text-fd-muted-foreground">Reference {item.label}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Pre(props: ComponentProps<'pre'>) {
  const code = Children.only(props.children) as ReactElement;
  const codeProps = code.props as ComponentProps<'code'>;

  let lang =
    codeProps.className
      ?.split(' ')
      .find((v) => v.startsWith('language-'))
      ?.slice('language-'.length) ?? 'text';

  if (lang === 'mdx') lang = 'md';

  return (
    <DynamicCodeBlock lang={lang} code={(codeProps.children ?? '') as string} />
  );
}

function Markdown({ text }: { text: string }) {
  const [rendered, setRendered] = useState<ReactNode>(map.get(text));

  useEffect(() => {
    let aborted = false;
    async function run() {
      let result = map.get(text);
      if (!result) {
        processor ??= createProcessor();

        result = await processor
          .process(text, {
            ...defaultMdxComponents,
            pre: Pre,
            img: undefined, // use JSX
          })
          .catch(() => text);
      }

      map.set(text, result);
      if (!aborted) setRendered(result);
    }

    void run();
    return () => {
      aborted = true;
    };
  }, [text]);

  return rendered ?? text;
}

export default function AISearch(props: DialogProps) {
  return (
    <Dialog {...props}>
      {props.children}
      <DialogPortal>
        <DialogOverlay className="data-[state=closed]:animate-fd-fade-out data-[state=open]:animate-fd-fade-in fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
        <DialogContent
          onOpenAutoFocus={(e) => {
            document.getElementById('nd-ai-input')?.focus();
            e.preventDefault();
          }}
          aria-describedby={undefined}
          className="data-[state=closed]:animate-fd-fade-out fixed left-1/2 z-50 flex w-[98vw] max-w-[860px] -translate-x-1/2 flex-col-reverse gap-3 focus-visible:outline-none max-md:top-12 md:bottom-12 md:flex-col"
        >
          <Content />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function Content() {
  const chat = useChat({
    id: 'search',
    streamProtocol: 'data',
    sendExtraMessageFields: true,
    onResponse(response) {
      if (response.status === 401) {
        console.error(response.statusText);
      }
    },
  });

  const messages = chat.messages.filter((msg) => msg.role !== 'system');

  return (
    <ChatContext value={chat}>
      {messages.length > 0 && (
        <List className="bg-fd-popover animate-fd-dialog-in duration-600 rounded-xl border shadow-lg">
          <div className="flex flex-col gap-4 p-3 pb-0">
            {messages.map((item) => (
              <Message key={item.id} message={item} />
            ))}
          </div>
          <SearchAIActions />
        </List>
      )}
      <div className="bg-fd-secondary/50 animate-fd-dialog-in rounded-xl p-2">
        <div className="bg-fd-popover text-fd-popover-foreground overflow-hidden rounded-xl border shadow-lg">
          <SearchAIInput />
          <div className="text-fd-muted-foreground flex items-center gap-2 px-3 py-1.5">
            <DialogTitle className="flex-1 text-xs">
              Powered by{' '}
              <a
                href="https://inkeep.com"
                target="_blank"
                className="text-fd-popover-foreground font-medium"
                rel="noreferrer noopener"
              >
                Inkeep AI
              </a>
              . AI can be inaccurate, please verify the information.
            </DialogTitle>
            <DialogClose
              aria-label="Close"
              tabIndex={-1}
              className={cn(buttonVariants({ size: 'sm', color: 'ghost' }))}
            >
              <X className="size-4" />
              Close Dialog
            </DialogClose>
          </div>
        </div>
      </div>
    </ChatContext>
  );
}
