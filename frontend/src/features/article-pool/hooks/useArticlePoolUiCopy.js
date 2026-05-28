import { useMemo } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  getArticlePoolLocale,
  getArticlePoolUiCopy,
  normalizeArticlePoolLanguage,
} from "../constants/articlePoolLanguage";

export function useArticlePoolUiCopy() {
  const { user } = useAuth();
  const language = normalizeArticlePoolLanguage(
    user?.preferredLanguage || user?.moneySiteLanguage
  );
  const copy = useMemo(() => getArticlePoolUiCopy(language), [language]);
  const locale = useMemo(() => getArticlePoolLocale(language), [language]);

  return {
    language,
    locale,
    copy,
  };
}
