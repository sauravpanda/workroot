import { createContext, useContext } from "react";

interface UiContextValue {
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  selectedWorktreeId: number | null;
  setSelectedWorktreeId: (id: number | null) => void;
}

export const UiContext = createContext<UiContextValue>({
  selectedProjectId: null,
  setSelectedProjectId: () => {},
  selectedWorktreeId: null,
  setSelectedWorktreeId: () => {},
});

export function useUiStore() {
  return useContext(UiContext);
}
