'use client';

import { useFormState } from 'react-dom';
import { addPost } from './_data';

export function AddPostForm() {
  const [state, action] = useFormState(addPost, {});

  return (
    <form action={action}>
      <input name="title" />
      <input name="content" />
      <button type="submit">Add post</button>
    </form>
  );
}
