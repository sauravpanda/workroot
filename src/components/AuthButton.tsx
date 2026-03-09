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
    logout,
  } = useAuth();

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
      <button onClick={startLogin} className="auth-button auth-login">
        Sign in with GitHub
      </button>
    </div>
  );
}
