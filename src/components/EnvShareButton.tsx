import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/env-share.css";

interface EnvShareButtonProps {
  profileId: number;
  profileName: string;
}

interface ShareResult {
  gist_url: string;
  gist_id: string;
}

interface SharedGist {
  id: string;
  url: string;
  description: string;
  created_at: string;
}

export function EnvShareButton({
  profileId,
  profileName,
}: EnvShareButtonProps) {
  const [mode, setMode] = useState<"idle" | "export" | "import" | "list">(
    "idle",
  );
  const [passphrase, setPassphrase] = useState("");
  const [gistId, setGistId] = useState("");
  const [result, setResult] = useState<ShareResult | null>(null);
  const [gists, setGists] = useState<SharedGist[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await invoke<ShareResult>("export_profile_to_gist", {
        profileId,
        passphrase: passphrase.trim(),
      });
      setResult(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim() || !gistId.trim()) return;
    setLoading(true);
    setError("");
    try {
      await invoke<number>("import_profile_from_gist", {
        projectId: profileId,
        gistId: gistId.trim(),
        passphrase: passphrase.trim(),
      });
      setMode("idle");
      setPassphrase("");
      setGistId("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleListGists = async () => {
    setMode("list");
    setLoading(true);
    setError("");
    try {
      const res = await invoke<SharedGist[]>("list_shared_gists");
      setGists(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMode("idle");
    setPassphrase("");
    setGistId("");
    setResult(null);
    setError("");
  };

  if (mode === "idle") {
    return (
      <div className="env-share">
        <div className="env-share-actions">
          <button
            className="env-share-btn env-share-export"
            onClick={() => setMode("export")}
            title="Share this profile as an encrypted Gist"
          >
            Export
          </button>
          <button
            className="env-share-btn env-share-import"
            onClick={() => setMode("import")}
            title="Import a shared profile from a Gist"
          >
            Import
          </button>
          <button
            className="env-share-btn env-share-list"
            onClick={handleListGists}
            title="View shared gists"
          >
            Shared
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="env-share">
        <div className="env-share-result">
          <p className="env-share-success">Profile exported successfully!</p>
          <a
            className="env-share-link"
            href={result.gist_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {result.gist_url}
          </a>
          <p className="env-share-gist-id">Gist ID: {result.gist_id}</p>
          <button className="env-share-btn" onClick={reset}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (mode === "list") {
    return (
      <div className="env-share">
        <div className="env-share-header">
          <h4>Shared Profiles</h4>
          <button className="env-share-close" onClick={reset}>
            x
          </button>
        </div>
        {loading && <p className="env-share-loading">Loading...</p>}
        {error && <p className="env-share-error">{error}</p>}
        {!loading && gists.length === 0 && (
          <p className="env-share-empty">No shared profiles found.</p>
        )}
        <ul className="env-share-gist-list">
          {gists.map((g) => (
            <li key={g.id} className="env-share-gist-item">
              <a href={g.url} target="_blank" rel="noopener noreferrer">
                {g.description || g.id}
              </a>
              <span className="env-share-gist-date">
                {new Date(g.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="env-share">
      <div className="env-share-header">
        <h4>{mode === "export" ? `Export "${profileName}"` : "Import Profile"}</h4>
        <button className="env-share-close" onClick={reset}>
          x
        </button>
      </div>
      {error && <p className="env-share-error">{error}</p>}
      <form onSubmit={mode === "export" ? handleExport : handleImport}>
        {mode === "import" && (
          <input
            className="env-share-input"
            type="text"
            value={gistId}
            onChange={(e) => setGistId(e.target.value)}
            placeholder="Gist ID"
            required
          />
        )}
        <input
          className="env-share-input"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Encryption passphrase"
          required
          autoFocus
        />
        <button
          className="env-share-btn env-share-submit"
          type="submit"
          disabled={loading}
        >
          {loading
            ? "Working..."
            : mode === "export"
              ? "Export"
              : "Import"}
        </button>
      </form>
    </div>
  );
}
