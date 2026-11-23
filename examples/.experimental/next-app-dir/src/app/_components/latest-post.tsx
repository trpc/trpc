import type { Temporal } from '@js-temporal/polyfill';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Field, FieldGroup, FieldLabel } from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Textarea } from '@shared/ui/components/textarea';
import { Badge } from './client-ui';

export function LatestPostCard(props: {
  post: {
    id: number;
    title: string;
    content: string;
    createdAt: Temporal.PlainDateTime;
  };
}) {
  const { post } = props;
  return (
    <Card>
      <CardHeader>
        <CardDescription>Latest post</CardDescription>
        <CardTitle className="text-2xl font-bold tracking-tight">
          {post.title}
        </CardTitle>
        <CardAction>
          <Badge variant="outline">#{post.id}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="leading-relaxed break-words whitespace-pre-wrap">
          {post.content}
        </p>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        <time dateTime={post.createdAt.toString()}>
          {post.createdAt.toLocaleString('en-US')}
        </time>
      </CardFooter>
    </Card>
  );
}

export function PostFields() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="title">Title</FieldLabel>
        <Input id="title" name="title" placeholder="A new post" />
      </Field>
      <Field>
        <FieldLabel htmlFor="content">Content</FieldLabel>
        <Textarea
          id="content"
          name="content"
          placeholder="What's it about?"
          rows={3}
        />
      </Field>
    </FieldGroup>
  );
}
