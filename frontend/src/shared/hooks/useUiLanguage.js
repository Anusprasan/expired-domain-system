import { useMemo } from "react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { getAppUiCopy, normalizeUiLanguage } from "../constants/uiLanguage";

export function useUiLanguage() {
  const { user } = useAuth();
  const language = normalizeUiLanguage(user?.preferredLanguage || user?.moneySiteLanguage);
  const copy = useMemo(() => getAppUiCopy(language), [language]);

  return {
    language,
    copy,
  };
}
