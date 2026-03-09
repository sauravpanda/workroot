import { createContext, useContext } from "react";

interface UiContextValue {
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  selectedWorktreeId: number | null;
  setSelectedWorktreeId: (id: number | null) => void;
  selectedWorktreePath: string | null;
  setSelectedWorktreePath: (path: string | null) => void;
  selectedWorktreeName: string | null;
  setSelectedWorktreeName: (name: string | null) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
}

export const UiContext = createContext<UiContextValue>({
  selectedProjectId: null,
  setSelectedProjectId: () => {},
  selectedWorktreeId: null,
  setSelectedWorktreeId: () => {},
  selectedWorktreePath: null,
  setSelectedWorktreePath: () => {},
  selectedWorktreeName: null,
  setSelectedWorktreeName: () => {},
  showSettings: false,
  setShowSettings: () => {},
});

export function useUiStore() {
  return useContext(UiContext);
}
