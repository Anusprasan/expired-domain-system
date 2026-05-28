import { useMemo } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  getDevelopmentLocale,
  getDevelopmentUiCopy,
  normalizeDevelopmentLanguage,
} from "../constants/developmentLanguage";

export function useDevelopmentUiCopy() {
  const { user } = useAuth();
  const language = normalizeDevelopmentLanguage(
    user?.preferredLanguage || user?.moneySiteLanguage
  );
  const copy = useMemo(() => getDevelopmentUiCopy(language), [language]);
  const locale = useMemo(() => getDevelopmentLocale(language), [language]);

  return {
    language,
    locale,
    copy,
  };
}
