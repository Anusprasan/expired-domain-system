import React, { useEffect, useMemo, useState } from "react";
import {
  createReportingMailProfileApi,
  createReportingMyMailProfileApi,
  deleteReportingMailProfileApi,
  deleteReportingMyMailProfileApi,
  getReportingMailProfilesAdminApi,
  getReportingMailProfilesMineApi,
  sendReportingMailProfileTestApi,
  sendReportingMyMailProfileTestApi,
  updateReportingMailProfileApi,
  updateReportingMyMailProfileApi,
} from "../api/reportingApi";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

const PERSONAL_SMTP_DEFAULTS = {
  host: "mail.200m.website",
  port: "587",
  from: "200M Team",
};

function getEmptyForm(scope = "personal") {
  const usePersonalDefaults = scope === "personal";

  return {
    name: "",
    brandId: "",
    host: usePersonalDefaults ? PERSONAL_SMTP_DEFAULTS.host : "",
    port: usePersonalDefaults ? PERSONAL_SMTP_DEFAULTS.port : "587",
    user: "",
    pass: "",
    from: usePersonalDefaults ? PERSONAL_SMTP_DEFAULTS.from : "",
    isBrandDefault: false,
    isGlobalDefault: false,
    isActive: true,
    testRecipient: "",
  };
}

function buildFormState(profile, scope = "personal") {
  return {
    ...getEmptyForm(scope),
    name: profile?.name || "",
    brandId: profile?.brandId?._id || profile?.brandId || "",
    host: profile?.host || getEmptyForm(scope).host,
    port: String(profile?.port || getEmptyForm(scope).port),
    user: profile?.user || "",
    pass: "",
    from: profile?.from || getEmptyForm(scope).from,
    isBrandDefault: Boolean(profile?.isBrandDefault),
    isGlobalDefault: Boolean(profile?.isGlobalDefault),
    isActive: profile?.isActive !== false,
    testRecipient: "",
  };
}

function getProfileLabel(profile, copy) {
  const baseLabel = profile?.name || copy.mailProfiles.untitled;
  return profile?.brandId?.brandName ? `${baseLabel} - ${profile.brandId.brandName}` : baseLabel;
}

export default function ReportingMailProfileManager({
  enabled,
  canManagePersonal = false,
  canManageShared = false,
}) {
  const { copy } = useReportingUiCopy();
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState(canManagePersonal ? "personal" : "shared");
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [personalProfiles, setPersonalProfiles] = useState([]);
  const [sharedProfiles, setSharedProfiles] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [form, setForm] = useState(getEmptyForm(canManagePersonal ? "personal" : "shared"));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isSharedScope = scope === "shared";
  const profiles = isSharedScope ? sharedProfiles : personalProfiles;
  const selectedProfile = useMemo(
    () => profiles.find((profile) => String(profile._id) === String(selectedProfileId)) || null,
    [profiles, selectedProfileId]
  );
  const isCreating = !selectedProfile;
  const hasBrandSelected = isSharedScope && Boolean(form.brandId);

  const syncSelectionForScope = (nextScope, nextPersonalProfiles, nextSharedProfiles, preferredProfileId = "") => {
    const nextProfiles = nextScope === "shared" ? nextSharedProfiles : nextPersonalProfiles;
    const resolvedProfileId =
      preferredProfileId && nextProfiles.some((profile) => String(profile._id) === String(preferredProfileId))
        ? preferredProfileId
        : nextProfiles[0]?._id || "";
    const resolvedProfile =
      nextProfiles.find((profile) => String(profile._id) === String(resolvedProfileId)) || null;

    setSelectedProfileId(resolvedProfileId);
    setForm(resolvedProfile ? buildFormState(resolvedProfile, nextScope) : getEmptyForm(nextScope));
  };

  const loadData = async (preferredProfileId = "", nextScope = scope) => {
    if (!enabled) {
      setPersonalProfiles([]);
      setSharedProfiles([]);
      setBrands([]);
      setSelectedProfileId("");
      setForm(getEmptyForm(nextScope));
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [mineResponse, adminResponse] = await Promise.all([
        canManagePersonal ? getReportingMailProfilesMineApi() : Promise.resolve(null),
        canManageShared ? getReportingMailProfilesAdminApi() : Promise.resolve(null),
      ]);

      const nextPersonalProfiles = mineResponse?.data?.profiles || [];
      const nextSharedProfiles = adminResponse?.data?.profiles || [];
      const nextBrands = adminResponse?.data?.brands || [];

      setPersonalProfiles(nextPersonalProfiles);
      setSharedProfiles(nextSharedProfiles);
      setBrands(nextBrands);
      syncSelectionForScope(nextScope, nextPersonalProfiles, nextSharedProfiles, preferredProfileId);
      setHasLoadedData(true);
    } catch (err) {
      setError(err.response?.data?.message || copy.mailProfiles.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      setHasLoadedData(false);
      setPersonalProfiles([]);
      setSharedProfiles([]);
      setBrands([]);
      setSelectedProfileId("");
      setForm(getEmptyForm(canManagePersonal ? "personal" : "shared"));
    }
  }, [enabled, canManagePersonal]);

  useEffect(() => {
    if (!canManagePersonal && scope === "personal") {
      setScope("shared");
      setSelectedProfileId("");
      setForm(getEmptyForm("shared"));
    }
  }, [canManagePersonal, scope]);

  const handleOpen = async () => {
    setIsOpen(true);
    setSuccess("");

    if (!hasLoadedData && !loading) {
      await loadData("", scope);
    }
  };

  const handleScopeChange = async (nextScope) => {
    if (nextScope === scope) {
      return;
    }

    setScope(nextScope);
    setError("");
    setSuccess("");

    if (!hasLoadedData) {
      await loadData("", nextScope);
      return;
    }

    syncSelectionForScope(nextScope, personalProfiles, sharedProfiles);
  };

  const handleSelectProfile = (profile) => {
    setSelectedProfileId(profile?._id || "");
    setForm(buildFormState(profile, scope));
    setError("");
    setSuccess("");
  };

  const handleCreateNew = () => {
    setSelectedProfileId("");
    setForm(getEmptyForm(scope));
    setError("");
    setSuccess("");
  };

  const handleChange = (field, value) => {
    setForm((currentForm) => {
      if (!isSharedScope) {
        return { ...currentForm, [field]: value };
      }

      if (field === "brandId") {
        return {
          ...currentForm,
          brandId: value,
          isBrandDefault: value ? currentForm.isBrandDefault : false,
          isGlobalDefault: value ? false : currentForm.isGlobalDefault,
        };
      }

      if (field === "isBrandDefault") {
        return {
          ...currentForm,
          isBrandDefault: Boolean(value) && Boolean(currentForm.brandId),
        };
      }

      if (field === "isGlobalDefault") {
        return {
          ...currentForm,
          isGlobalDefault: Boolean(value) && !currentForm.brandId,
        };
      }

      return { ...currentForm, [field]: value };
    });

    setError("");
    setSuccess("");
  };

  const handleSave = async (event) => {
    event.preventDefault();

    try {
      setBusyAction(isCreating ? "create" : "update");
      setError("");
      setSuccess("");

      const basePayload = {
        name: form.name,
        host: form.host,
        port: form.port,
        user: form.user,
        pass: form.pass,
        from: form.from,
        isActive: form.isActive,
      };

      const payload = isSharedScope
        ? {
            ...basePayload,
            brandId: form.brandId,
            isBrandDefault: form.isBrandDefault,
            isGlobalDefault: form.isGlobalDefault,
          }
        : basePayload;

      const response =
        isSharedScope
          ? isCreating
            ? await createReportingMailProfileApi(payload)
            : await updateReportingMailProfileApi(selectedProfileId, payload)
          : isCreating
            ? await createReportingMyMailProfileApi(payload)
            : await updateReportingMyMailProfileApi(selectedProfileId, payload);

      const savedProfileId = response.data?._id || selectedProfileId;
      await loadData(savedProfileId, scope);
      setSuccess(
        isCreating
          ? isSharedScope
            ? copy.mailProfiles.createSharedSuccess
            : copy.mailProfiles.createPersonalSuccess
          : isSharedScope
            ? copy.mailProfiles.updateSharedSuccess
            : copy.mailProfiles.updatePersonalSuccess
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (isSharedScope
            ? copy.mailProfiles.saveSharedError
            : copy.mailProfiles.savePersonalError)
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async () => {
    if (!selectedProfile) {
      return;
    }

    try {
      setBusyAction("delete");
      setError("");
      setSuccess("");

      if (isSharedScope) {
        await deleteReportingMailProfileApi(selectedProfile._id);
      } else {
        await deleteReportingMyMailProfileApi(selectedProfile._id);
      }

      await loadData("", scope);
      setSuccess(
        isSharedScope
          ? copy.mailProfiles.deleteSharedSuccess
          : copy.mailProfiles.deletePersonalSuccess
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (isSharedScope
            ? copy.mailProfiles.deleteSharedError
            : copy.mailProfiles.deletePersonalError)
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleSendTest = async () => {
    if (!selectedProfile) {
      return;
    }

    try {
      setBusyAction("test");
      setError("");
      setSuccess("");

      const response = isSharedScope
        ? await sendReportingMailProfileTestApi(selectedProfile._id, { to: form.testRecipient })
        : await sendReportingMyMailProfileTestApi(selectedProfile._id, { to: form.testRecipient });
      const recipients = response.data?.to?.join(", ") || form.testRecipient;

      await loadData(selectedProfile._id, scope);
      setForm((currentForm) => ({ ...currentForm, testRecipient: "" }));
      setSuccess(copy.mailProfiles.testSent(recipients));
    } catch (err) {
      setError(err.response?.data?.message || copy.mailProfiles.testError);
    } finally {
      setBusyAction("");
    }
  };

  if (!enabled) {
    return null;
  }

  return (
    <>
      <div className="reporting-settings-control">
        <button
          type="button"
          className="management-button-secondary reporting-settings-trigger"
          onClick={handleOpen}
        >
          {copy.mailProfiles.trigger}
        </button>
      </div>

      {isOpen ? (
        <div className="workflow-modal-backdrop" role="presentation">
          <div
            className="workflow-modal-shell reporting-mail-admin-modal-shell"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reporting-mail-profile-manager-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="workflow-modal-header reporting-settings-modal-header">
              <div className="workflow-modal-titleblock">
                <h3 id="reporting-mail-profile-manager-title">{copy.mailProfiles.title}</h3>
                <p>{copy.mailProfiles.description}</p>
              </div>
              <button
                type="button"
                className="management-button-secondary workflow-modal-close"
                onClick={() => setIsOpen(false)}
                disabled={Boolean(busyAction)}
              >
                {copy.common.close}
              </button>
            </div>

            <div className="reporting-mail-admin-body">
              <div className="reporting-mail-admin-scope-tabs">
                {canManagePersonal ? (
                  <button
                    type="button"
                    className={`reporting-mail-admin-scope-tab${!isSharedScope ? " is-active" : ""}`}
                    onClick={() => handleScopeChange("personal")}
                    disabled={Boolean(busyAction)}
                  >
                    {copy.mailProfiles.myProfilesTab}
                  </button>
                ) : null}
                {canManageShared ? (
                  <button
                    type="button"
                    className={`reporting-mail-admin-scope-tab${isSharedScope ? " is-active" : ""}`}
                    onClick={() => handleScopeChange("shared")}
                    disabled={Boolean(busyAction)}
                  >
                    {copy.mailProfiles.sharedProfilesTab}
                  </button>
                ) : null}
              </div>

              {canManagePersonal && !isSharedScope ? (
                <div className="reporting-mail-admin-personal-note">
                  {copy.mailProfiles.personalNote}
                </div>
              ) : null}

              {error ? <p className="management-error reporting-settings-inline-message">{error}</p> : null}
              {success ? <p className="reporting-success-banner reporting-settings-inline-message">{success}</p> : null}

              {loading ? (
                <div className="reporting-workspace-empty">{copy.mailProfiles.loading}</div>
              ) : (
                <div className="reporting-mail-admin-grid">
                  <aside className="reporting-mail-admin-list-panel">
                    <div className="reporting-mail-admin-list-header">
                      <div>
                        <h4>{isSharedScope ? copy.mailProfiles.sharedProfiles : copy.mailProfiles.myProfiles}</h4>
                        <p>{copy.mailProfiles.configured(profiles.length)}</p>
                      </div>
                      <button
                        type="button"
                        className="management-button-secondary reporting-settings-trigger"
                        onClick={handleCreateNew}
                        disabled={Boolean(busyAction)}
                      >
                        {isSharedScope
                          ? copy.mailProfiles.newSharedProfile
                          : copy.mailProfiles.newMyProfile}
                      </button>
                    </div>

                    <div className="reporting-mail-admin-list">
                      {profiles.length ? (
                        profiles.map((profile) => (
                          <button
                            key={profile._id}
                            type="button"
                            className={`reporting-mail-admin-item${selectedProfileId === profile._id ? " is-active" : ""}`}
                            onClick={() => handleSelectProfile(profile)}
                          >
                            <div className="reporting-mail-admin-item-top">
                              <strong>{getProfileLabel(profile, copy)}</strong>
                              <span className={`reporting-mail-admin-status${profile.isActive ? " is-active" : ""}`}>
                                {profile.isActive ? copy.mailProfiles.active : copy.mailProfiles.inactive}
                              </span>
                            </div>
                            <p>{profile.from}</p>
                            <div className="reporting-mail-admin-tags">
                              {isSharedScope ? (
                                <>
                                  {profile.brandId?.brandName ? <span>{profile.brandId.brandName}</span> : <span>{copy.mailProfiles.shared}</span>}
                                  {profile.isBrandDefault ? <span>{copy.mailProfiles.brandDefault}</span> : null}
                                  {profile.isGlobalDefault ? <span>{copy.mailProfiles.globalDefault}</span> : null}
                                </>
                              ) : (
                                <span>{copy.mailProfiles.personal}</span>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="reporting-workspace-empty">
                          {isSharedScope
                            ? copy.mailProfiles.noSharedProfiles
                            : copy.mailProfiles.noPersonalProfiles}
                        </div>
                      )}
                    </div>
                  </aside>

                  <form className="reporting-mail-admin-form" onSubmit={handleSave}>
                    <div className="reporting-settings-section">
                      <div className="reporting-settings-section-header">
                        <h4>
                          {isCreating
                            ? isSharedScope
                              ? copy.mailProfiles.createSharedTitle
                              : copy.mailProfiles.createPersonalTitle
                            : isSharedScope
                              ? copy.mailProfiles.editSharedTitle
                              : copy.mailProfiles.editPersonalTitle}
                        </h4>
                        <span className={`reporting-settings-badge${form.isActive ? " is-ready" : ""}`}>
                          {form.isActive ? copy.mailProfiles.active : copy.mailProfiles.inactive}
                        </span>
                      </div>

                      <div className="management-field-grid">
                        <div className="management-field">
                          <label htmlFor="reporting-mail-profile-name">{copy.mailProfiles.profileName}</label>
                          <input
                            id="reporting-mail-profile-name"
                            type="text"
                            value={form.name}
                            onChange={(event) => handleChange("name", event.target.value)}
                            placeholder={
                              isSharedScope
                                ? copy.mailProfiles.sharedNamePlaceholder
                                : copy.mailProfiles.personalNamePlaceholder
                            }
                            required
                          />
                        </div>

                        {isSharedScope ? (
                          <div className="management-field">
                            <label htmlFor="reporting-mail-profile-brand">{copy.mailProfiles.brandLink}</label>
                            <select
                              id="reporting-mail-profile-brand"
                              value={form.brandId}
                              onChange={(event) => handleChange("brandId", event.target.value)}
                            >
                              <option value="">{copy.mailProfiles.noBrand}</option>
                              {brands.map((brand) => (
                                <option key={brand._id} value={brand._id}>
                                  {brand.brandName}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="management-field">
                            <label htmlFor="reporting-mail-profile-user">{copy.mailProfiles.smtpUser}</label>
                            <input
                              id="reporting-mail-profile-user"
                              type="text"
                              value={form.user}
                              onChange={(event) => handleChange("user", event.target.value)}
                              placeholder={copy.mailProfiles.personalUserPlaceholder}
                              required
                            />
                          </div>
                        )}
                      </div>

                      <div className="management-field-grid">
                        <div className="management-field">
                          <label htmlFor="reporting-mail-profile-host">{copy.mailProfiles.smtpHost}</label>
                          <input
                            id="reporting-mail-profile-host"
                            type="text"
                            value={form.host}
                            onChange={(event) => handleChange("host", event.target.value)}
                            placeholder={copy.mailProfiles.hostPlaceholder}
                            required
                          />
                        </div>

                        <div className="management-field">
                          <label htmlFor="reporting-mail-profile-port">{copy.mailProfiles.smtpPort}</label>
                          <input
                            id="reporting-mail-profile-port"
                            type="number"
                            min="1"
                            value={form.port}
                            onChange={(event) => handleChange("port", event.target.value)}
                            placeholder={copy.mailProfiles.portPlaceholder}
                            required
                          />
                        </div>
                      </div>

                      {isSharedScope ? (
                        <div className="management-field-grid">
                        <div className="management-field">
                            <label htmlFor="reporting-mail-profile-user-shared">{copy.mailProfiles.smtpUser}</label>
                            <input
                              id="reporting-mail-profile-user-shared"
                              type="text"
                              value={form.user}
                              onChange={(event) => handleChange("user", event.target.value)}
                              placeholder={copy.mailProfiles.sharedUserPlaceholder}
                              required
                            />
                          </div>

                          <div className="management-field">
                            <label htmlFor="reporting-mail-profile-from">{copy.mailProfiles.mailFrom}</label>
                            <input
                              id="reporting-mail-profile-from"
                              type="text"
                              value={form.from}
                              onChange={(event) => handleChange("from", event.target.value)}
                              placeholder={copy.mailProfiles.sharedFromPlaceholder}
                              required
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="management-field">
                          <label htmlFor="reporting-mail-profile-from">{copy.mailProfiles.mailFrom}</label>
                          <input
                            id="reporting-mail-profile-from"
                            type="text"
                            value={form.from}
                            onChange={(event) => handleChange("from", event.target.value)}
                            placeholder={copy.mailProfiles.personalFromPlaceholder}
                            required
                          />
                        </div>
                      )}

                      <div className="management-field">
                        <label htmlFor="reporting-mail-profile-pass">{copy.mailProfiles.smtpPassword}</label>
                        <input
                          id="reporting-mail-profile-pass"
                          type="password"
                          value={form.pass}
                          onChange={(event) => handleChange("pass", event.target.value)}
                          placeholder={
                            selectedProfile?.hasStoredPassword
                              ? copy.mailProfiles.keepSavedPassword
                              : copy.mailProfiles.enterSmtpPassword
                          }
                        />
                      </div>

                      {isSharedScope ? (
                        <div className="reporting-mail-admin-toggle-grid">
                          <label className="management-checkbox">
                            <input
                              type="checkbox"
                              checked={form.isBrandDefault}
                              onChange={(event) => handleChange("isBrandDefault", event.target.checked)}
                              disabled={!hasBrandSelected}
                            />
                            <span>
                              <strong>{copy.mailProfiles.useAsBrandDefault}</strong>
                              <small>{copy.mailProfiles.useAsBrandDefaultHelp}</small>
                            </span>
                          </label>

                          <label className="management-checkbox">
                            <input
                              type="checkbox"
                              checked={form.isGlobalDefault}
                              onChange={(event) => handleChange("isGlobalDefault", event.target.checked)}
                              disabled={hasBrandSelected}
                            />
                            <span>
                              <strong>{copy.mailProfiles.useAsGlobalDefault}</strong>
                              <small>{copy.mailProfiles.useAsGlobalDefaultHelp}</small>
                            </span>
                          </label>

                          <label className="management-checkbox">
                            <input
                              type="checkbox"
                              checked={form.isActive}
                              onChange={(event) => handleChange("isActive", event.target.checked)}
                            />
                            <span>
                              <strong>{copy.mailProfiles.profileIsActive}</strong>
                              <small>{copy.mailProfiles.sharedActiveHelp}</small>
                            </span>
                          </label>
                        </div>
                      ) : (
                        <div className="reporting-mail-admin-toggle-grid is-personal">
                          <label className="management-checkbox">
                            <input
                              type="checkbox"
                              checked={form.isActive}
                              onChange={(event) => handleChange("isActive", event.target.checked)}
                            />
                            <span>
                              <strong>{copy.mailProfiles.profileIsActive}</strong>
                              <small>{copy.mailProfiles.personalActiveHelp}</small>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="reporting-settings-section">
                      <div className="reporting-settings-section-header">
                        <h4>{copy.mailProfiles.testEmail}</h4>
                        <span className={`reporting-settings-badge${selectedProfile ? " is-ready" : ""}`}>
                          {selectedProfile ? copy.mailProfiles.savedProfile : copy.mailProfiles.saveFirst}
                        </span>
                      </div>

                      <div className="management-field">
                        <label htmlFor="reporting-mail-profile-test">{copy.mailProfiles.sendTestTo}</label>
                        <input
                          id="reporting-mail-profile-test"
                          type="text"
                          value={form.testRecipient}
                          onChange={(event) => handleChange("testRecipient", event.target.value)}
                          placeholder={copy.mailProfiles.testPlaceholder}
                          disabled={!selectedProfile}
                        />
                      </div>

                      <div className="management-actions">
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={handleSendTest}
                          disabled={!selectedProfile || !form.testRecipient.trim() || Boolean(busyAction)}
                        >
                          {busyAction === "test" ? copy.mailProfiles.sending : copy.mailProfiles.sendTestMail}
                        </button>
                      </div>
                    </div>

                    <div className="management-actions reporting-settings-modal-actions">
                      {selectedProfile ? (
                        <button
                          type="button"
                          className="management-button-secondary reporter-task-action-delete"
                          onClick={handleDelete}
                          disabled={Boolean(busyAction)}
                        >
                          {busyAction === "delete" ? copy.common.deleting : copy.mailProfiles.deleteProfile}
                        </button>
                      ) : null}
                      <button type="submit" className="management-button" disabled={Boolean(busyAction)}>
                        {busyAction === "create" || busyAction === "update"
                          ? copy.common.saving
                          : isCreating
                            ? copy.mailProfiles.createProfile
                            : copy.mailProfiles.saveChanges}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
