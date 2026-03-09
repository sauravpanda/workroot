import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface EnvProfile {
  id: number;
  project_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface DecryptedEnvVar {
  id: number;
  profile_id: number;
  key: string;
  value: string;
  created_at: string;
}

export function useEnvVault(projectId: number | null) {
  const [profiles, setProfiles] = useState<EnvProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [envVars, setEnvVars] = useState<DecryptedEnvVar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    if (projectId === null) return;
    try {
      const result = await invoke<EnvProfile[]>("vault_list_profiles", {
        projectId,
      });
      setProfiles(result);
      if (result.length > 0 && activeProfileId === null) {
        setActiveProfileId(result[0].id);
      }
    } catch (err: unknown) {
      setError(String(err));
    }
  }, [projectId, activeProfileId]);

  const loadEnvVars = useCallback(async () => {
    if (activeProfileId === null) return;
    setIsLoading(true);
    try {
      const result = await invoke<DecryptedEnvVar[]>("vault_get_env_vars", {
        profileId: activeProfileId,
      });
      setEnvVars(result);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [activeProfileId]);

  useEffect(() => {
    if (projectId !== null) {
      loadProfiles();
    } else {
      setProfiles([]);
      setActiveProfileId(null);
      setEnvVars([]);
    }
  }, [projectId, loadProfiles]);

  useEffect(() => {
    if (activeProfileId !== null) {
      loadEnvVars();
    } else {
      setEnvVars([]);
    }
  }, [activeProfileId, loadEnvVars]);

  const createProfile = useCallback(
    async (name: string) => {
      if (projectId === null) return;
      setError(null);
      try {
        const id = await invoke<number>("vault_create_profile", {
          projectId,
          name,
        });
        await loadProfiles();
        setActiveProfileId(id);
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [projectId, loadProfiles],
  );

  const deleteProfile = useCallback(
    async (profileId: number) => {
      setError(null);
      try {
        await invoke<boolean>("vault_delete_profile", { profileId });
        if (activeProfileId === profileId) {
          setActiveProfileId(null);
        }
        await loadProfiles();
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [activeProfileId, loadProfiles],
  );

  const duplicateProfile = useCallback(
    async (sourceProfileId: number, newName: string) => {
      setError(null);
      try {
        const id = await invoke<number>("vault_duplicate_profile", {
          sourceProfileId,
          newName,
        });
        await loadProfiles();
        setActiveProfileId(id);
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [loadProfiles],
  );

  const addEnvVar = useCallback(
    async (key: string, value: string) => {
      if (activeProfileId === null) return;
      setError(null);
      try {
        await invoke<number>("vault_store_env_var", {
          profileId: activeProfileId,
          key,
          value,
        });
        await loadEnvVars();
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [activeProfileId, loadEnvVars],
  );

  const updateEnvVar = useCallback(
    async (varId: number, key: string, value: string) => {
      setError(null);
      try {
        await invoke<null>("vault_update_env_var", { varId, key, value });
        await loadEnvVars();
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [loadEnvVars],
  );

  const deleteEnvVar = useCallback(
    async (varId: number) => {
      setError(null);
      try {
        await invoke<boolean>("vault_delete_env_var", { varId });
        await loadEnvVars();
      } catch (err: unknown) {
        setError(String(err));
      }
    },
    [loadEnvVars],
  );

  return {
    profiles,
    activeProfileId,
    setActiveProfileId,
    envVars,
    isLoading,
    error,
    loadProfiles,
    createProfile,
    deleteProfile,
    duplicateProfile,
    addEnvVar,
    updateEnvVar,
    deleteEnvVar,
  };
}

export type { EnvProfile, DecryptedEnvVar };
