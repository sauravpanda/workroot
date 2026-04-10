import { useState, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjects, type GitHubRepo } from "../hooks/useProjects";

export function RepoList() {
  const {
    projects,
    githubRepos,
    isLoading,
    error,
    loadGithubRepos,
    registerLocal,
    cloneAndRegister,
    removeProject,
  } = useProjects();

  const [search, setSearch] = useState("");
  const [cloneDir, setCloneDir] = useState("");
  const [cloningRepo, setCloningRepo] = useState<string | null>(null);
  const [view, setView] = useState<"projects" | "github">("projects");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const registeredUrls = useMemo(
    () =>
      new Set(
        projects
          .map((p) => p.github_url)
          .filter((u): u is string => u !== null),
      ),
    [projects],
  );

  const filteredRepos = useMemo(() => {
    if (!search) return githubRepos;
    const lower = search.toLowerCase();
    return githubRepos.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) ||
        r.full_name.toLowerCase().includes(lower) ||
        r.description?.toLowerCase().includes(lower),
    );
  }, [githubRepos, search]);

  const handleAddLocal = async () => {
    setActionError(null);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        await registerLocal(selected);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to register local project",
      );
    }
  };

  const handleClone = async (repo: GitHubRepo) => {
    setActionError(null);
    try {
      if (!cloneDir) {
        const dir = await open({ directory: true, multiple: false });
        if (!dir) return;
        setCloneDir(dir);
        setCloningRepo(repo.full_name);
        await cloneAndRegister(repo.clone_url, repo.name, dir, repo.html_url);
        setCloningRepo(null);
      } else {
        setCloningRepo(repo.full_name);
        await cloneAndRegister(
          repo.clone_url,
          repo.name,
          cloneDir,
          repo.html_url,
        );
        setCloningRepo(null);
      }
    } catch (err) {
      setCloningRepo(null);
      setActionError(
        err instanceof Error ? err.message : `Failed to clone ${repo.name}`,
      );
    }
  };

  return (
    <div className="repo-list">
      {actionError && (
        <div
          style={{
            color: "var(--error)",
            padding: "8px 12px",
            fontSize: "0.85em",
            cursor: "pointer",
          }}
          onClick={() => setActionError(null)}
        >
          {actionError}
        </div>
      )}
      <div className="repo-tabs">
        <button
          className={`repo-tab ${view === "projects" ? "active" : ""}`}
          onClick={() => setView("projects")}
        >
          My Projects ({projects.length})
        </button>
        <button
          className={`repo-tab ${view === "github" ? "active" : ""}`}
          onClick={() => {
            setView("github");
            if (githubRepos.length === 0) loadGithubRepos();
          }}
        >
          GitHub Repos
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {view === "projects" && (
        <div className="repo-section">
          <button onClick={handleAddLocal} className="repo-action-btn">
            + Add local folder
          </button>
          {projects.length === 0 ? (
            <p className="repo-empty">
              No projects registered yet. Add a local folder or clone from
              GitHub.
            </p>
          ) : (
            <ul className="repo-items">
              {projects.map((p) => (
                <li key={p.id} className="repo-item">
                  <div className="repo-item-info">
                    <span className="repo-name">{p.name}</span>
                    <span className="repo-meta">
                      {p.framework && (
                        <span className="repo-lang">{p.framework}</span>
                      )}
                      <span className="repo-path">{p.local_path}</span>
                    </span>
                  </div>
                  {confirmingDeleteId === p.id ? (
                    <>
                      <button
                        onClick={async () => {
                          await removeProject(p.id);
                          setConfirmingDeleteId(null);
                        }}
                        className="repo-remove-btn repo-remove-confirm"
                        title="Confirm removal"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(null)}
                        className="repo-remove-btn repo-remove-cancel"
                        title="Cancel removal"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmingDeleteId(p.id)}
                      className="repo-remove-btn"
                      title="Remove project"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === "github" && (
        <div className="repo-section">
          <input
            type="text"
            placeholder="Search repos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="repo-search"
          />
          {isLoading && <p className="repo-loading">Loading repos...</p>}
          {!isLoading && filteredRepos.length === 0 && (
            <p className="repo-empty">
              {githubRepos.length === 0
                ? "Sign in with GitHub to see your repos."
                : "No matching repos found."}
            </p>
          )}
          <ul className="repo-items">
            {filteredRepos.map((repo) => (
              <li key={repo.id} className="repo-item">
                <div className="repo-item-info">
                  <span className="repo-name">{repo.name}</span>
                  <span className="repo-meta">
                    {repo.language && (
                      <span className="repo-lang">{repo.language}</span>
                    )}
                    {repo.description && (
                      <span className="repo-desc">{repo.description}</span>
                    )}
                  </span>
                </div>
                {registeredUrls.has(repo.html_url) ? (
                  <span className="repo-registered">Registered</span>
                ) : (
                  <button
                    onClick={() => handleClone(repo)}
                    disabled={cloningRepo !== null}
                    className="repo-clone-btn"
                  >
                    {cloningRepo === repo.full_name ? "Cloning..." : "Clone"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
