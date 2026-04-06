import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  isLoading: boolean;
  error: string | null;
  deviceCode: DeviceCodeResponse | null;
  isPolling: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
    error: null,
    deviceCode: null,
    isPolling: false,
  });

  const mountedRef = useRef(true);

  const checkAuth = useCallback(async () => {
    try {
      const user = await invoke<GitHubUser | null>("github_get_user");
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        isAuthenticated: user !== null,
        user,
        isLoading: false,
        error: null,
      }));
    } catch {
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loginWithPat = useCallback(async (token: string) => {
    setState((prev) => ({ ...prev, error: null, isLoading: true }));
    try {
      await invoke("github_store_pat", { token });
      if (!mountedRef.current) return;
      const user = await invoke<GitHubUser | null>("github_get_user");
      if (!mountedRef.current) return;
      if (user) {
        setState((prev) => ({
          ...prev,
          isAuthenticated: true,
          user,
          isLoading: false,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Invalid token — could not authenticate with GitHub.",
        }));
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        error: String(err),
        isLoading: false,
      }));
    }
  }, []);

  const startLogin = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, isLoading: true }));
    try {
      const deviceCode = await invoke<DeviceCodeResponse>(
        "github_start_device_flow",
      );
      setState((prev) => ({
        ...prev,
        deviceCode,
        isLoading: false,
        isPolling: true,
      }));

      // Start polling in the background
      invoke("github_poll_for_token", {
        deviceCode: deviceCode.device_code,
        interval: deviceCode.interval,
      })
        .then(async () => {
          if (!mountedRef.current) return;
          const user = await invoke<GitHubUser | null>("github_get_user");
          if (!mountedRef.current) return;
          setState((prev) => ({
            ...prev,
            isAuthenticated: true,
            user,
            deviceCode: null,
            isPolling: false,
            error: null,
          }));
        })
        .catch((err: unknown) => {
          if (!mountedRef.current) return;
          setState((prev) => ({
            ...prev,
            error: String(err),
            deviceCode: null,
            isPolling: false,
          }));
        });
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        error: String(err),
        isLoading: false,
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await invoke("github_logout");
      setState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null,
        deviceCode: null,
        isPolling: false,
      });
    } catch (err: unknown) {
      setState((prev) => ({ ...prev, error: String(err) }));
    }
  }, []);

  return {
    ...state,
    startLogin,
    loginWithPat,
    logout,
  };
}
