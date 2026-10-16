// #region context
import type { QueryClient } from "@raf-query/react";
import { createContext } from "react-router";

export const queryClientContext = createContext<QueryClient>();
// #endregion context
