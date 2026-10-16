/// <reference types="@rsbuild/core/types" />

declare module '*.css'
declare module '*.css?url' {
  const url: string
  export default url
}
