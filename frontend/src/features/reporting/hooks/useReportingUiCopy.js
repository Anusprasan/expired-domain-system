import { useMemo } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  getReportingLocale,
  getReportingUiCopy,
  normalizeReportingLanguage,
} from "../constants/reportingLanguage";

export function useReportingUiCopy() {
  const { user } = useAuth();
  const language = normalizeReportingLanguage(
    user?.preferredLanguage || user?.moneySiteLanguage
  );
  const copy = useMemo(() => getReportingUiCopy(language), [language]);
  const locale = useMemo(() => getReportingLocale(language), [language]);

  return {
    language,
    locale,
    copy,
  };
}
