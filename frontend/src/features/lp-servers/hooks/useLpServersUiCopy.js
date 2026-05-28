import { useMemo } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  getLpServersLocale,
  getLpServersUiCopy,
  normalizeLpServersLanguage,
} from "../constants/lpServersLanguage";

export function useLpServersUiCopy() {
  const { user } = useAuth();
  const language = normalizeLpServersLanguage(
    user?.preferredLanguage || user?.moneySiteLanguage
  );
  const copy = useMemo(() => getLpServersUiCopy(language), [language]);
  const locale = useMemo(() => getLpServersLocale(language), [language]);

  return {
    language,
    locale,
    copy,
  };
}
