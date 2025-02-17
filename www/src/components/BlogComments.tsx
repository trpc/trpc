export function BlogComments(props: { discussionId: number }) {
  return (
    <script
      src="https://giscus.app/client.js"
      data-repo="trpc/trpc"
      data-repo-id="MDEwOlJlcG9zaXRvcnkyODA1NTcwNTQ="
      data-mapping="number"
      data-term={props.discussionId}
      data-reactions-enabled="1"
      data-emit-metadata="0"
      data-input-position="bottom"
      data-theme="preferred_color_scheme"
      data-lang="en"
      crossOrigin="anonymous"
      async
    ></script>
  );
}
