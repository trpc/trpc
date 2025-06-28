// source.config.ts
import {
  rehypeCodeDefaultOptions,
  remarkSteps
} from "fumadocs-core/mdx-plugins";
import { remarkInstall } from "fumadocs-docgen";
import { remarkTypeScriptToJavaScript } from "fumadocs-docgen/remark-ts2js";
import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema
} from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";
import { createFileSystemTypesCache } from "fumadocs-twoslash/cache-fs";
import { remarkAutoTypeTable } from "fumadocs-typescript";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { z } from "zod";
var docs = defineDocs({
  docs: {
    async: true,
    schema: frontmatterSchema.extend({
      preview: z.string().optional(),
      index: z.boolean().default(false),
      /**
       * API routes only
       */
      method: z.string().optional()
    })
  },
  meta: {
    schema: metaSchema.extend({
      description: z.string().optional()
    })
  }
});
var source_config_default = defineConfig({
  lastModifiedTime: "git",
  mdxOptions: {
    rehypeCodeOptions: {
      lazy: true,
      experimentalJSEngine: true,
      langs: ["ts", "js", "html", "tsx", "mdx"],
      inline: "tailing-curly-colon",
      themes: {
        light: "catppuccin-latte",
        dark: "catppuccin-mocha"
      },
      transformers: [
        ...rehypeCodeDefaultOptions.transformers ?? [],
        transformerTwoslash({
          typesCache: createFileSystemTypesCache()
        }),
        {
          name: "@shikijs/transformers:remove-notation-escape",
          code(hast) {
            function replace(node) {
              if (node.type === "text") {
                node.value = node.value.replace("[\\!code", "[!code");
              } else if ("children" in node) {
                for (const child of node.children) {
                  replace(child);
                }
              }
            }
            replace(hast);
            return hast;
          }
        }
      ]
    },
    remarkCodeTabOptions: {
      parseMdx: true
    },
    remarkPlugins: [
      remarkSteps,
      remarkMath,
      remarkAutoTypeTable,
      [remarkInstall, { persist: { id: "package-manager" } }],
      remarkTypeScriptToJavaScript
    ],
    rehypePlugins: (v) => [rehypeKatex, ...v]
  }
});
export {
  source_config_default as default,
  docs
};
