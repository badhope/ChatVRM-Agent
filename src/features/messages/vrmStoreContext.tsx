import { createContext, useContext } from "react";
import type { Viewer } from "@/features/vrmViewer/viewer";

export const VrmStoreContext = createContext<Viewer | null>(null);

export function useVrmStore() {
  const ctx = useContext(VrmStoreContext);
  if (!ctx) throw new Error("useVrmStore must be used within VrmStoreProvider");
  return ctx;
}

export function VrmStoreProvider({
  viewer,
  children,
}: {
  viewer: Viewer;
  children?: React.ReactNode;
}) {
  return (
    <VrmStoreContext.Provider value={viewer}>
      {children}
    </VrmStoreContext.Provider>
  );
}