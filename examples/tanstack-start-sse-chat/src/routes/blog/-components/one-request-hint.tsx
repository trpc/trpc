/** Says where to look to see that a page's queries are one request */
export function OneRequestHint(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="max-w-2xl rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground [&_code]:font-mono [&_code]:text-foreground">
      <span className="font-medium text-foreground">See it yourself: </span>
      {props.children}
    </p>
  );
}
