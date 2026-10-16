import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "tsx" } },
});

tester.run("inline-jsx-callback", plugin.rules["inline-jsx-callback"], {
	valid: [
		`function Page() {
       return <Button onClick={() => save()} />;
     }`,
		`function Page() {
       function save() {
         persist();
       }
       return <>
         <Button onClick={save} />
         <Button onClick={save} />
       </>;
     }`,
		`function Page() {
       const onSelect = () => select();
       onSelect();
       api.on("select", onSelect);
       return null;
     }`,
		`function Page() {
       const remove = (id: string) => deleteItem(id);
       return items.map((item) => <Row item={item} onRemove={remove} />);
     }`,
		`export function save() {
       persist();
     }
     function Page() {
       return <Button onClick={save} />;
     }`,
	],
	invalid: [
		{
			code: `function Page() {
        const save = () => persist();
        return <Button onClick={save} />;
      }`,
			errors: [
				{
					messageId: "inline",
					suggestions: [
						{
							messageId: "inlineSuggestion",
							output: `function Page() {
        return <Button onClick={() => persist()} />;
      }`,
						},
					],
				},
			],
		},
		{
			code: `function Page() {
        async function save(value: string) {
          await persist(value);
        }
        return <Form onSubmit={save} />;
      }`,
			errors: [
				{
					messageId: "inline",
					suggestions: [
						{
							messageId: "inlineSuggestion",
							output: `function Page() {
        return <Form onSubmit={async (value: string) => {
          await persist(value);
        }} />;
      }`,
						},
					],
				},
			],
		},
		{
			code: `function Page() {
        const save = () => persist(), cancel = () => close();
        return <Button onClick={save} />;
      }`,
			errors: [{ messageId: "inline", suggestions: null }],
		},
		{
			code: `function Page() {
        return items.map((item) => {
          const remove = () => deleteItem(item.id);
          return <Row onRemove={remove} />;
        });
      }`,
			errors: [
				{
					messageId: "inline",
					suggestions: [
						{
							messageId: "inlineSuggestion",
							output: `function Page() {
        return items.map((item) => {
          return <Row onRemove={() => deleteItem(item.id)} />;
        });
      }`,
						},
					],
				},
			],
		},
	],
});
