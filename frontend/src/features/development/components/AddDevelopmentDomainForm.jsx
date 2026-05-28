import React, { useEffect, useMemo, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { getArticlePoolArticlesApi } from "../../article-pool/api/articlePoolApi";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasAnyPrivilege } from "../../../shared/utils/permissions";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

function normalizeBrandName(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    const legacyMatch = value.match(/brandname['"]?\s*:\s*['"]([^'"]+)['"]/i);
    return legacyMatch ? legacyMatch[1].trim().toUpperCase() : value.trim().toUpperCase();
  }

  if (typeof value === "object" && value.brandName) {
    return String(value.brandName).trim().toUpperCase();
  }

  return String(value).trim().toUpperCase();
}

function getArticleTitle(article, fallback = "Untitled content") {
  return article?.content?.title || article?.topic || fallback;
}

function getArticleDescription(article) {
  return article?.content?.summary || "";
}

function getArticleBody(article) {
  return article?.content?.body || "";
}

function mapArticleToDevelopmentContent(article) {
  return {
    title: getArticleTitle(article),
    description: getArticleDescription(article),
    article: getArticleBody(article),
    note: article?.content?.note || "",
  };
}

function ArticleSelectionModal({
  copy,
  brandName,
  articles,
  loading,
  error,
  activeArticleId,
  onActiveArticleChange,
  onUseArticle,
  onRetry,
  onClose,
}) {
  const activeArticle =
    articles.find((article) => String(article._id) === String(activeArticleId)) || articles[0] || null;
  const activeDescription = getArticleDescription(activeArticle);
  const activeBody = getArticleBody(activeArticle);

  return (
    <div className="management-modal-backdrop">
      <div className="management-modal app-panel management-modal-wide development-article-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="management-section-header">
          <div>
            <h2>{copy.addDomainForm.articlePicker.title}</h2>
            <p>
              {brandName
                ? copy.addDomainForm.articlePicker.filteredForBrand(brandName)
                : copy.addDomainForm.articlePicker.selectBrandFirst}
            </p>
          </div>
        </div>

        <div className="development-article-picker-layout">
          <aside className="development-article-picker-list-panel">
            <div className="development-article-picker-panel-header">
              <strong>{copy.addDomainForm.articlePicker.contentTitles}</strong>
              <span>{copy.addDomainForm.articlePicker.found(articles.length)}</span>
            </div>

            {loading ? (
              <div className="development-article-picker-state">{copy.addDomainForm.articlePicker.loading}</div>
            ) : error ? (
              <div className="development-article-picker-state is-error">
                <p>{error}</p>
                <button type="button" className="management-button-secondary" onClick={onRetry}>
                  {copy.common.retry}
                </button>
              </div>
            ) : articles.length ? (
              <div className="development-article-picker-list">
                {articles.map((article) => {
                  const isActive = String(article._id) === String(activeArticle?._id || "");

                  return (
                    <button
                      key={article._id}
                      type="button"
                      className={`development-article-picker-item${isActive ? " is-active" : ""}`}
                      onClick={() => onActiveArticleChange(article._id)}
                    >
                      <strong>{getArticleTitle(article, copy.common.notAvailable)}</strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="development-article-picker-state">
                {copy.addDomainForm.articlePicker.noContentFound}
              </div>
            )}
          </aside>

          <section className="development-article-picker-preview">
            {activeArticle ? (
              <>
                <div className="development-article-picker-preview-header">
                  <span>{normalizeBrandName(activeArticle.brandName)}</span>
                  <h3>{getArticleTitle(activeArticle, copy.common.notAvailable)}</h3>
                </div>

                <div className="development-article-picker-preview-section">
                  <strong>{copy.common.description}</strong>
                  <p>{activeDescription || copy.common.notAvailable}</p>
                </div>

                <div className="development-article-picker-preview-section">
                  <strong>{copy.common.content}</strong>
                  {activeBody ? (
                    <div
                      className="development-preview-html development-article-picker-body"
                      dangerouslySetInnerHTML={{ __html: activeBody }}
                    />
                  ) : (
                    <p>{copy.common.notAvailable}</p>
                  )}
                </div>
              </>
            ) : (
              <div className="development-article-picker-state">
                {copy.addDomainForm.articlePicker.selectTitleToPreview}
              </div>
            )}
          </section>
        </div>

        <div className="management-actions development-article-picker-actions">
          <button
            type="button"
            className="management-button"
            onClick={() => onUseArticle(activeArticle)}
            disabled={!activeArticle}
          >
            {copy.addDomainForm.articlePicker.useContent}
          </button>
          <button type="button" className="management-button-secondary" onClick={onClose}>
            {copy.addDomainForm.articlePicker.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AddDevelopmentDomainForm({ brands, busy, onSubmit, onCancel }) {
  const { user } = useAuth();
  const { copy } = useDevelopmentUiCopy();
  const [form, setForm] = useState({
    brandName: "",
    domain: "",
    landingPage: "",
    termsAndConditionsPage: "",
    aboutPage: "",
    contactPage: "",
  });
  const [localError, setLocalError] = useState("");
  const [showArticlePicker, setShowArticlePicker] = useState(false);
  const [brandArticles, setBrandArticles] = useState([]);
  const [articlePickerLoading, setArticlePickerLoading] = useState(false);
  const [articlePickerError, setArticlePickerError] = useState("");
  const [activeArticleId, setActiveArticleId] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [articleReloadKey, setArticleReloadKey] = useState(0);

  const brandOptions = useMemo(
    () => [...brands].sort((left, right) => left.brandName.localeCompare(right.brandName)),
    [brands]
  );

  const canReadArticlePool = hasAnyPrivilege(user, [
    "READ_ARTICLE_POOL",
    "CREATE_ARTICLE_POOL",
    "EDIT_ARTICLE_POOL",
    "DELETE_ARTICLE_POOL",
    "ADMIN_ACCESS",
  ]);

  const handleChange = (key, value) => {
    if (key === "brandName") {
      setSelectedArticle(null);
      setBrandArticles([]);
      setActiveArticleId("");
      setArticlePickerError("");
    }

    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!showArticlePicker || !form.brandName || !canReadArticlePool) {
      return undefined;
    }

    let ignore = false;

    const loadBrandArticles = async () => {
      try {
        setArticlePickerLoading(true);
        setArticlePickerError("");

        const response = await getArticlePoolArticlesApi({
          brandName: form.brandName,
          availableForDevelopment: true,
        });
        const normalizedBrandName = normalizeBrandName(form.brandName);
        const nextArticles = (response.data || []).filter(
          (article) => normalizeBrandName(article.brandName) === normalizedBrandName
        );

        if (ignore) {
          return;
        }

        setBrandArticles(nextArticles);
        setActiveArticleId((current) =>
          nextArticles.some((article) => String(article._id) === String(current))
            ? current
            : nextArticles[0]?._id || ""
        );
      } catch (error) {
        if (!ignore) {
          setBrandArticles([]);
          setActiveArticleId("");
          setArticlePickerError(error.response?.data?.message || copy.addDomainForm.loadBrandContentError);
        }
      } finally {
        if (!ignore) {
          setArticlePickerLoading(false);
        }
      }
    };

    loadBrandArticles();

    return () => {
      ignore = true;
    };
  }, [articleReloadKey, canReadArticlePool, copy.addDomainForm.loadBrandContentError, form.brandName, showArticlePicker]);

  const handleOpenArticlePicker = () => {
    if (!form.brandName) {
      setLocalError(copy.addDomainForm.selectBrandBeforeChoosing);
      return;
    }

    if (!canReadArticlePool) {
      setLocalError(copy.addDomainForm.contentPoolPermissionRequired);
      return;
    }

    setLocalError("");
    setShowArticlePicker(true);
  };

  const handleUseArticle = (article) => {
    if (!article) {
      return;
    }

    setSelectedArticle(article);
    setShowArticlePicker(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.brandName) {
      setLocalError(copy.addDomainForm.selectBrandError);
      return;
    }

    if (!form.domain.trim()) {
      setLocalError(copy.addDomainForm.domainRequired);
      return;
    }

    if (!form.landingPage.trim()) {
      setLocalError(copy.addDomainForm.landingRequired);
      return;
    }

    try {
      setLocalError("");
      const payload = {
        brandName: form.brandName,
        domain: form.domain,
        landingPage: form.landingPage,
        termsAndConditionsPage: form.termsAndConditionsPage,
        aboutPage: form.aboutPage,
        contactPage: form.contactPage,
      };

      if (selectedArticle) {
        payload.articlePoolArticleId = selectedArticle._id;
        payload.content = mapArticleToDevelopmentContent(selectedArticle);
      }

      await onSubmit(payload);
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.addDomainForm.saveError);
    }
  };

  return (
    <form className="app-panel management-form" onSubmit={handleSubmit}>
      <div className="management-section-header">
        <div>
          <h2>{copy.addDomainForm.title}</h2>
          <p>{copy.addDomainForm.description}</p>
        </div>
      </div>

      <ToastNotice message={localError} onClose={() => setLocalError("")} />

      <div className="management-fields">
        <div className="management-field">
          <label htmlFor="development-brandName">{copy.addDomainForm.brand}</label>
          <select
            id="development-brandName"
            value={form.brandName}
            onChange={(event) => handleChange("brandName", event.target.value)}
            disabled={busy}
          >
            <option value="">{copy.addDomainForm.selectBrand}</option>
            {brandOptions.map((brand) => (
              <option key={brand._id} value={brand.brandName}>
                {brand.brandName}
              </option>
            ))}
          </select>
        </div>

        <div className="management-field development-article-selector-field">
          <label>{copy.addDomainForm.content}</label>
          <div className="development-article-selector-row">
            <button
              type="button"
              className="management-button-secondary"
              onClick={handleOpenArticlePicker}
              disabled={busy || !form.brandName || !canReadArticlePool}
            >
              {selectedArticle ? copy.addDomainForm.changeContent : copy.addDomainForm.selectContent}
            </button>
            {selectedArticle ? (
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => setSelectedArticle(null)}
                disabled={busy}
              >
                {copy.common.remove}
              </button>
            ) : null}
          </div>
          {!form.brandName ? (
            <span className="management-help-text">{copy.addDomainForm.selectBrandFirst}</span>
          ) : !canReadArticlePool ? (
            <span className="management-help-text">{copy.addDomainForm.readPermissionRequired}</span>
          ) : selectedArticle ? (
            <div className="development-selected-article">
              <span>{copy.addDomainForm.selectedContent}</span>
              <strong>{getArticleTitle(selectedArticle, copy.common.notAvailable)}</strong>
              <p>{getArticleDescription(selectedArticle) || copy.common.noDescriptionAdded}</p>
            </div>
          ) : (
            <span className="management-help-text">{copy.addDomainForm.chooseContentHelp}</span>
          )}
        </div>

        <div className="management-field-grid">
          <div className="management-field">
            <label htmlFor="development-domain">{copy.addDomainForm.domain}</label>
            <input id="development-domain" value={form.domain} onChange={(event) => handleChange("domain", event.target.value)} placeholder={copy.addDomainForm.domainPlaceholder} disabled={busy} />
          </div>
          <div className="management-field">
            <label htmlFor="development-landingPage">{copy.addDomainForm.landingPage}</label>
            <input id="development-landingPage" value={form.landingPage} onChange={(event) => handleChange("landingPage", event.target.value)} placeholder={copy.addDomainForm.landingPagePlaceholder} disabled={busy} />
          </div>
          <div className="management-field">
            <label htmlFor="development-terms">{copy.addDomainForm.termsAndConditionsPage}</label>
            <input id="development-terms" value={form.termsAndConditionsPage} onChange={(event) => handleChange("termsAndConditionsPage", event.target.value)} placeholder={copy.addDomainForm.termsPlaceholder} disabled={busy} />
          </div>
          <div className="management-field">
            <label htmlFor="development-aboutPage">{copy.addDomainForm.aboutPage}</label>
            <input id="development-aboutPage" value={form.aboutPage} onChange={(event) => handleChange("aboutPage", event.target.value)} placeholder={copy.addDomainForm.aboutPlaceholder} disabled={busy} />
          </div>
          <div className="management-field">
            <label htmlFor="development-contactPage">{copy.addDomainForm.contactPage}</label>
            <input id="development-contactPage" value={form.contactPage} onChange={(event) => handleChange("contactPage", event.target.value)} placeholder={copy.addDomainForm.contactPlaceholder} disabled={busy} />
          </div>
        </div>
      </div>

      <div className="management-actions">
        <button type="submit" className="management-button" disabled={busy}>
          {busy ? copy.common.saving : copy.addDomainForm.submit}
        </button>
        <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
          {copy.common.cancel}
        </button>
      </div>

      {showArticlePicker ? (
        <ArticleSelectionModal
          copy={copy}
          brandName={form.brandName}
          articles={brandArticles}
          loading={articlePickerLoading}
          error={articlePickerError}
          activeArticleId={activeArticleId}
          onActiveArticleChange={setActiveArticleId}
          onUseArticle={handleUseArticle}
          onRetry={() => setArticleReloadKey((current) => current + 1)}
          onClose={() => setShowArticlePicker(false)}
        />
      ) : null}
    </form>
  );
}
