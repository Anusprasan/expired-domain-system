import { useMemo } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import { getMoneySiteUiCopy, normalizeMoneySiteLanguage } from "../constants/moneySiteLanguage";

export function useMoneySiteUiCopy() {
  const { user } = useAuth();
  const language = normalizeMoneySiteLanguage(
    user?.preferredLanguage || user?.moneySiteLanguage
  );
  const copy = useMemo(() => getMoneySiteUiCopy(language), [language]);

  return {
    language,
    copy,
  };
}
