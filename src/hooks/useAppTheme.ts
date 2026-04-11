import { useState, useEffect } from "react";
import { getAppThemeById } from "../themes/builtin";
import { applyTheme, loadSavedThemeId, type AppTheme } from "../themes/engine";
import {
  applyDensity,
  loadSavedDensity,
  type DensityMode,
} from "../themes/density";
import { loadCustomCSS } from "../themes/customCSS";

export function useAppTheme() {
  const [appThemeId, setAppThemeId] = useState("midnight");
  const [densityMode, setDensityMode] = useState<DensityMode>("comfortable");

  useEffect(() => {
    loadSavedThemeId().then((id) => {
      setAppThemeId(id);
      applyTheme(getAppThemeById(id));
    });
    loadSavedDensity().then((m) => {
      setDensityMode(m);
      applyDensity(m);
    });
    loadCustomCSS();
  }, []);

  const applyAppTheme = (theme: AppTheme) => {
    applyTheme(theme);
    setAppThemeId(theme.id);
  };

  const applyDensityMode = (mode: DensityMode) => {
    setDensityMode(mode);
    applyDensity(mode);
  };

  return {
    appThemeId,
    densityMode,
    setAppThemeId,
    setDensityMode,
    applyAppTheme,
    applyDensityMode,
  };
}
