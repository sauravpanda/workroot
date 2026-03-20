import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export function AuthButton() {
  const {
    isAuthenticated,
    user,
    isLoading,
    error,
    deviceCode,
    isPolling,
    startLogin,
    loginWithPat,
    logout,
  } = useAuth();

  const [patInput, setPatInput] = useState("");
  const [showPatForm, setShowPatForm] = useState(false);

  if (isLoading) {
    return <div className="auth-section">Loading...</div>;
  }

  if (isAuthenticated && user) {
    return (
      <div className="auth-section">
        <div className="auth-user">
          <img src={user.avatar_url} alt={user.login} className="auth-avatar" />
          <span className="auth-username">{user.name ?? user.login}</span>
        </div>
        <button onClick={logout} className="auth-button auth-logout">
          Sign out
        </button>
      </div>
    );
  }

  if (deviceCode && isPolling) {
    return (
      <div className="auth-section">
        <p className="auth-instructions">
          Go to{" "}
          <a
            href={deviceCode.verification_uri}
            target="_blank"
            rel="noopener noreferrer"
          >
            {deviceCode.verification_uri}
          </a>{" "}
          and enter the code:
        </p>
        <code className="auth-code">{deviceCode.user_code}</code>
        <p className="auth-waiting">Waiting for authorization...</p>
      </div>
    );
  }

  return (
    <div className="auth-section">
      {error && <p className="auth-error">{error}</p>}

      {showPatForm ? (
        <div className="auth-pat-form">
          <label className="auth-pat-label">
            Personal Access Token
            <input
              type="password"
              className="auth-pat-input"
              value={patInput}
              onChange={(e) => setPatInput(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              onKeyDown={(e) => {
                if (e.key === "Enter" && patInput.trim()) {
                  loginWithPat(patInput.trim());
                }
              }}
            />
          </label>
          <p className="auth-pat-hint">
            Generate a token at{" "}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/settings/tokens
            </a>{" "}
            with <code>repo</code> and <code>user</code> scopes.
          </p>
          <div className="auth-pat-actions">
            <button
              onClick={() => loginWithPat(patInput.trim())}
              className="auth-button auth-login"
              disabled={!patInput.trim()}
            >
              Save Token
            </button>
            <button
              onClick={() => setShowPatForm(false)}
              className="auth-button auth-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="auth-options">
          <button
            onClick={() => setShowPatForm(true)}
            className="auth-button auth-login"
          >
            Sign in with Token
          </button>
          <button onClick={startLogin} className="auth-button auth-secondary">
            Use Device Flow
          </button>
          <p className="auth-pat-hint">
            If you have the{" "}
            <a
              href="https://cli.github.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub CLI
            </a>{" "}
            installed, your token is detected automatically.
          </p>
        </div>
      )}
    </div>
  );
}
