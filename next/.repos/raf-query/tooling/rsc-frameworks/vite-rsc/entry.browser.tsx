import { createFromFetch } from "@vitejs/plugin-rsc/browser";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";

const root = await createFromFetch<ReactNode>(fetch("?rsc"));
hydrateRoot(document, root);
