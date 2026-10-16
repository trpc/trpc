import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import { markdownFences } from "./markdown-fences.ts";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

const rule = plugin.rules["no-use-member-access"];

tester.run("no-use-member-access", rule, {
	valid: [
		`function Post(props: Props) {
       const post = use(props.post);
       return <h1>{post.title}</h1>;
     }`,
		`function Post(props: Props) {
       const { title } = use(props.post);
       return <h1 title={title}>{title}{title}</h1>;
     }`,
		`function Comments(props: Props) {
       const comments = use(props.comments);
       return comments.map((comment) => <p key={comment.id}>{comment.body}</p>);
     }`,
		`const [postPromise] = useQuery(postQuery, handle);`,
		`const issues = Issues.use((issues) => issues.list()).pipe(Effect.orDie);`,
		`const value = useContext(Theme).color;`,
		`const value = use.title;`,
	],
	invalid: [
		{
			code: `function Post(props: Props) {
         return <h1>{use(props.post).title}</h1>;
       }`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const ids = use(itemsPromise).map((item) => item.id);`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const first = use(pagesPromise).pages[0];`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const title = use(postPromise)?.title;`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const first = use(listPromise)[0];`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const title = (use(postPromise)).title;`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const title = use(postPromise)!.title;`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const title = React.use(postPromise).title;`,
			errors: [{ messageId: "memberAccess" }],
		},
		{
			code: `const theme = use(ThemeContext).color;`,
			errors: [{ messageId: "memberAccess" }],
		},
	],
});

tester.run("no-use-member-access in Markdown fences", rule, {
	valid: markdownFences(),
	invalid: [],
});
