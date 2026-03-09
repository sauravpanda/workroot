import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface WorktreeInfo {
  id: number;
  project_id: number;
  branch_name: string;
  path: string;
  status: string;
  is_dirty: boolean;
  port: number | null;
  created_at: string;
}

interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
}

export function useWorktrees(projectId: number | null) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorktrees = useCallback(async () => {
    if (projectId === null) return;
    try {
      const result = await invoke<WorktreeInfo[]>("list_project_worktrees", {
        projectId,
      });
      setWorktrees(result);
    } catch (err: unknown) {
      setError(String(err));
    }
  }, [projectId]);

  const loadBranches = useCallback(async () => {
    if (projectId === null) return;
    try {
      const result = await invoke<BranchInfo[]>("list_branches", {
        projectId,
      });
      setBranches(result);
    } catch (err: unknown) {
      setError(String(err));
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId !== null) {
      loadWorktrees();
    } else {
      setWorktrees([]);
    }
  }, [projectId, loadWorktrees]);

  const createWorktree = useCallback(
    async (branchName: string, createNewBranch: boolean) => {
      if (projectId === null) return;
      setIsLoading(true);
      setError(null);
      try {
        await invoke<WorktreeInfo>("create_worktree", {
          projectId,
          branchName,
          createNewBranch,
        });
        await loadWorktrees();
      } catch (err: unknown) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, loadWorktrees],
  );

  const deleteWorktree = useCallback(
    async (worktreeId: number) => {
      setError(null);
      try {
        await invoke<boolean>("delete_worktree", { worktreeId });
        await loadWorktrees();
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [loadWorktrees],
  );

  return {
    worktrees,
    branches,
    isLoading,
    error,
    loadWorktrees,
    loadBranches,
    createWorktree,
    deleteWorktree,
  };
}

export type { WorktreeInfo, BranchInfo };
