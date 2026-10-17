import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';

import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'tsx' } },
});

tester.run(
  'no-overzealous-destructuring',
  plugin.rules['no-overzealous-destructuring']!,
  {
    valid: [
      `function Card(props: Props) {
         return <h1>{props.title}{props.subtitle}</h1>;
       }`,
      `function Card(props: Props) {
         const title = props.title;
         return <h1>{title}{title}</h1>;
       }`,
      `function Subscribe(props: Props) {
         const { babyId } = props;
         save(babyId);
         track(babyId);
         return <Link id={babyId} />;
       }`,
      `function Card({ baby }: Props) {
         return <>{baby.name}{baby.dueDate}{baby.status}</>;
       }`,
      `function Form(props: Props) {
         const { id, ...rest } = props.form;
         return <Provider {...rest} id={id} />;
       }`,
      `function Field({ field }: FieldProps) {
         return <Input {...field} />;
       }`,
      `function Post(props: Props) {
         const post = use(props.post);
         return <h1>{post.title}{post.body}</h1>;
       }`,
      `function Post(props: Props) {
         const [postPromise, controls] = useQuery(postQuery, props.post);
         return <Body post={postPromise} busy={controls.isFetching} />;
       }`,
      `function Post(props: Props) {
         const { title } = use(props.post);
         return <h1 title={title}>{title}{title}</h1>;
       }`,
      `export const { trpc, prefetch } = createTrpcRsc(opts);`,
      `declare function load({ id }: Input): Post;`,
      `function load({ id }: Input): Post;
       function load(input: Input) {
         return find(input.id);
       }`,
      `for (const { id } of posts) seen.add(id);`,
      `let { id } = post;
         use(id);`,
    ],
    invalid: [
      {
        code: `function Post(props: Props) {
          const { title, body } = use(props.post);
          return <article><h1>{title}</h1><p>{body}</p></article>;
        }`,
        errors: [
          {
            messageId: 'value',
            data: { name: 'title', count: '1', field: 'title' },
          },
          {
            messageId: 'value',
            data: { name: 'body', count: '1', field: 'body' },
          },
        ],
      },
      {
        code: `async function load(qc: Client) {
          const { orgId } = await qc.fetch(currentUserQuery);
          return orgId;
        }`,
        errors: [
          {
            messageId: 'value',
            data: { name: 'orgId', count: '1', field: 'orgId' },
          },
        ],
      },
      {
        code: `function Posts() {
          const loaderData = Route.useLoaderData();
          const { posts } = loaderData;
          return <List posts={posts} />;
        }`,
        errors: [
          {
            messageId: 'body',
            data: { name: 'posts', count: '1', member: 'loaderData.posts' },
            suggestions: [
              {
                messageId: 'directSuggestion',
                output: `function Posts() {
          const loaderData = Route.useLoaderData();
          return <List posts={loaderData.posts} />;
        }`,
              },
            ],
          },
        ],
      },
      {
        code: `function Card(props: Props) {
          const { title } = props.post;
          return <h1>{title}</h1>;
        }`,
        errors: [
          {
            messageId: 'body',
            data: { name: 'title', count: '1', member: 'props.post.title' },
            suggestions: [
              {
                messageId: 'directSuggestion',
                output: `function Card(props: Props) {
          return <h1>{props.post.title}</h1>;
        }`,
              },
            ],
          },
        ],
      },
      {
        code: `function Card(props: Props) {
          const { title } = props;
          return <h1>{title}{title}</h1>;
        }`,
        errors: [
          {
            messageId: 'body',
            data: { name: 'title', count: '2', member: 'props.title' },
            suggestions: [
              {
                messageId: 'directSuggestion',
                output: `function Card(props: Props) {
          return <h1>{props.title}{props.title}</h1>;
        }`,
              },
            ],
          },
        ],
      },
      {
        code: `function Card(props: Props) {
          const { title, baby } = props;
          consume(baby);
          consume(baby);
          consume(baby);
          return <h1>{title}{title}</h1>;
        }`,
        errors: [
          {
            messageId: 'body',
            data: { name: 'title', count: '2', member: 'props.title' },
            suggestions: null,
          },
        ],
      },
      {
        code: `function Card({ title }: Props) {
          return <h1>{title}</h1>;
        }`,
        errors: [
          {
            messageId: 'parameter',
            data: { name: 'title', count: '1' },
            suggestions: null,
          },
        ],
      },
      {
        code: `function Card({ title = "Untitled" }: Props) {
          return <h1>{title}</h1>;
        }`,
        errors: [
          {
            messageId: 'parameter',
            data: { name: 'title', count: '1' },
            suggestions: null,
          },
        ],
      },
    ],
  },
);
