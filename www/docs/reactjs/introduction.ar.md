---
id: introduction
title: Usage with React
sidebar_label: Usage with React
slug: /react
---



:::info
- إذا كنت من مستخدمي Next.js إقرا هذه المستندات  [ الاستخدام مع Next.js](nextjs)  

- من أجل الحصول على أقصى استفادة من هذه المكتبة ، يجب أن تكون كلتا الواجهتين (الأمامية والخلفية في نفس المشروع)
- 
:::

## اضف tRPC الي مشورع ريأكت React

### الواجهة الخلفيه

#### 1. تثبيت المتطلبات

**npm**

```bash
npm install @trpc/server@next zod
```

**yarn**

```bash
yarn add @trpc/server@next zod
```

**pnpm**

```bash
pnpm add @trpc/server@next zod
```

##### لماذا  Zod ؟

معظم الامثله تستخدم [Zod](https://github.com/colinhacks/zod) للتحقق من صلاحية المُدخلات , إستخدمها  بالتحديد ليس إجباريا لكننا ننصحك بذلك . يمكنك ان تسخدم  ([Yup](https://github.com/jquense/yup), [Superstruct](https://github.com/ianstormtaylor/superstruct), [io-ts](https://github.com/gcanti/io-ts), etc). فأي مكتية تحتوي علي  `parse`, `create` or `validateSync` ستعمل بلا مشاكل.

#### 2. تفعيل strict mode

إذا أردت أن تستخدم Zod للتحقق من صلاحية المُدخلات, فتأكدمن تفعيل  strict mode في `tsconfig.json` أولاََ.

```diff title="tsconfig.json"
  "compilerOptions": {
+   "strict": true
  }
```

إذا كنت لا تريد تفعيل  strict mode, فيكفي أن تُفعل  `strictNullChecks`: 

```diff title="tsconfig.json"
  "compilerOptions": {
+   "strictNullChecks": true
  }
```

#### 3. تنفيذ `appRouter`

اتبع تعليمات [Quickstart](quickstart) واقرأ مستندات [`@trpc/server`](router) إذا أردت الارشاد

بمجرد أن تُنفذ الـ API يمكنك أن تنتقل االي الخطوة التاليه

### الواجهة الامامية

>مكتبة tRPC متوافقة مع  Create React App !

#### 1. تثبيت المتطلبات

**npm**

```bash
npm install @trpc/client@next @trpc/server@next @trpc/react-query@next @tanstack/react-query
```

**yarn**

```bash
yarn add @trpc/client@next @trpc/server@next @trpc/react-query@next @tanstack/react-query
```

**pnpm**

```bash
pnpm add @trpc/client@next @trpc/server@next @trpc/react-query@next @tanstack/react-query
```

##### ما هو `@trpc/server` ؟

هذة المكتبة ضرورية لتشغيل  `@trpc/client` لذا يجب أن تثبتها مرة أخري.

##### ما هو `@tanstack/react-query` ؟

مكتبة `@trpc/react-query`  توفر لك غلافاَ حول `@tanstack/react-query` لذا فهي مكتية إجبارية.

#### 2. إنشاء tRPC hooks.

Create a set of strongly-typed React hooks from your `AppRouter` type signature with `createTRPCReact`.

```tsx title='utils/trpc.ts'
// utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../path/to/router.ts';

export const trpc = createTRPCReact<AppRouter>();
```

#### 3. أضف tRPC providers

```tsx title='App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import React, { useState } from 'react';
import { trpc } from './utils/trpc';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: 'http://localhost:5000/trpc',
          // optional
          headers() {
            return {
              authorization: getAuthCookie(),
            };
          },
        }),
      ],
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {/* Your app here */}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

#### 4. إجلب البيانات

```tsx title='pages/IndexPage.tsx'
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const hello = trpc.hello.useQuery({ text: 'client' });
  if (!hello.data) return <div>Loading...</div>;
  return (
    <div>
      <p>{hello.data.greeting}</p>
    </div>
  );
}
```
