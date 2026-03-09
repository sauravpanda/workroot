import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProjectInfo {
  id: number;
  name: string;
  github_url: string | null;
  local_path: string;
  framework: string | null;
  created_at: string;
  updated_at: string;
  exists_locally: boolean;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  language: string | null;
  pushed_at: string | null;
  private: boolean;
}

export function useProjects() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const result = await invoke<ProjectInfo[]>("list_projects");
      setProjects(result);
    } catch (err: unknown) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const loadGithubRepos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const repos = await invoke<GitHubRepo[]>("list_github_repos");
      setGithubRepos(repos);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const registerLocal = useCallback(
    async (localPath: string) => {
      setError(null);
      try {
        await invoke<ProjectInfo>("register_local_project", { localPath });
        await loadProjects();
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [loadProjects],
  );

  const cloneAndRegister = useCallback(
    async (
      cloneUrl: string,
      name: string,
      targetDir: string,
      githubUrl?: string,
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        await invoke<ProjectInfo>("clone_and_register", {
          cloneUrl,
          name,
          targetDir,
          githubUrl: githubUrl ?? null,
        });
        await loadProjects();
      } catch (err: unknown) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [loadProjects],
  );

  const removeProject = useCallback(
    async (id: number) => {
      setError(null);
      try {
        await invoke<boolean>("remove_project", { id });
        await loadProjects();
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [loadProjects],
  );

  return {
    projects,
    githubRepos,
    isLoading,
    error,
    loadProjects,
    loadGithubRepos,
    registerLocal,
    cloneAndRegister,
    removeProject,
  };
}

export type { ProjectInfo, GitHubRepo };
