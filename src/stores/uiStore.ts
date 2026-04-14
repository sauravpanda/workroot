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
  agentDoneWorktreeIds: Set<number>;
  markAgentDone: (id: number) => void;
  clearAgentDone: (id: number) => void;
  agentNeedsAttentionIds: Set<number>;
  markAgentNeedsAttention: (id: number) => void;
  clearAgentNeedsAttention: (id: number) => void;
  agentRunningWorktreeIds: Set<number>;
  markAgentRunning: (id: number) => void;
  clearAgentRunning: (id: number) => void;
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
  agentDoneWorktreeIds: new Set(),
  markAgentDone: () => {},
  clearAgentDone: () => {},
  agentNeedsAttentionIds: new Set(),
  markAgentNeedsAttention: () => {},
  clearAgentNeedsAttention: () => {},
  agentRunningWorktreeIds: new Set(),
  markAgentRunning: () => {},
  clearAgentRunning: () => {},
});

export function useUiStore() {
  return useContext(UiContext);
}
