import React, { useEffect, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import axiosClient from "../../../shared/api/axiosClient";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useLpServersUiCopy } from "../hooks/useLpServersUiCopy";

const EMPTY_FORM = {
  brandId: "",
  url: "",
  serverIp: "",
  username: "",
  password: "",
  note: "",
};

export default function LpServerForm({
  brands = [],
  selected,
  onSubmit,
  onCancel,
  busy,
}) {
  const { copy } = useLpServersUiCopy();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setError("");
    setShowPassword(false);

    if (selected) {
      setForm({
        brandId: selected.brandId?._id || selected.brandId || "",
        url: selected.url || "",
        serverIp: selected.serverIp || "",
        username: selected.username || "",
        password: "",
        note: selected.note || "",
      });

      const fetchPassword = async () => {
        try {
          setLoadingPassword(true);

          const res = await axiosClient.get(`/lp-servers/${selected._id}/password`);
          const password = res.data.password || res.data.data?.password;

          if (!cancelled && password) {
            setForm((prev) => ({
              ...prev,
              password,
            }));
          }
        } catch (err) {
          console.error(err);
        } finally {
          if (!cancelled) {
            setLoadingPassword(false);
          }
        }
      };

      void fetchPassword();
    } else {
      setForm(EMPTY_FORM);
      setLoadingPassword(false);
    }

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.brandId || !form.url || !form.username || !form.password) {
      setError(copy.form.requiredError);
      return;
    }

    onSubmit(form);
  };

  return (
    <section className="app-panel management-form">
      <ToastNotice message={error} onClose={() => setError("")} />

      <h2>{selected ? copy.form.titleEdit : copy.form.titleCreate}</h2>

      <form onSubmit={handleSubmit} className="management-fields">
        {selected ? (
          <div className="management-field">
            <label>{copy.form.brand}</label>
            <input value={selected.brandId?.brandName || ""} disabled />
            <small className="management-help-text">{copy.form.brandFixedHelp}</small>
          </div>
        ) : (
          <div className="management-field">
            <label>{copy.form.brand}</label>
            <select name="brandId" value={form.brandId} onChange={handleChange} required disabled={busy}>
              <option value="">{copy.form.selectBrand}</option>
              {brands.map((brand) => (
                <option key={brand._id} value={brand._id}>
                  {brand.brandName}
                </option>
              ))}
            </select>
            <small className="management-help-text">{copy.form.brandHelp}</small>
          </div>
        )}

        <div className="management-field">
          <label>{copy.form.url}</label>
          <input
            name="url"
            value={form.url}
            onChange={handleChange}
            placeholder={copy.form.urlPlaceholder}
            required
            disabled={busy}
          />
          <small className="management-help-text">{copy.form.urlHelp}</small>
        </div>

        <div className="management-field">
          <label>{copy.form.serverIp}</label>
          <input
            name="serverIp"
            value={form.serverIp}
            onChange={handleChange}
            placeholder={copy.form.serverIpPlaceholder}
            disabled={busy}
          />
          <small className="management-help-text">{copy.form.serverIpHelp}</small>
        </div>

        <div className="management-field">
          <label>{copy.form.username}</label>
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            placeholder={copy.form.usernamePlaceholder}
            disabled={busy}
          />
          <small className="management-help-text">{copy.form.usernameHelp}</small>
        </div>

        <div className="management-field">
          <label>{copy.form.password}</label>
          <div style={{ position: "relative" }}>
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              value={loadingPassword ? copy.form.passwordLoading : form.password}
              onChange={handleChange}
              style={{ paddingRight: "40px" }}
              placeholder={copy.form.passwordPlaceholder}
              disabled={busy || loadingPassword}
            />

            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              title={showPassword ? copy.form.hidePassword : copy.form.showPassword}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          <small className="management-help-text">{copy.form.passwordHelp}</small>
        </div>

        <div className="management-field">
          <label>{copy.form.note}</label>
          <textarea
            name="note"
            value={form.note}
            onChange={handleChange}
            placeholder={copy.form.notePlaceholder}
            disabled={busy}
          />
          <small className="management-help-text">{copy.form.noteHelp}</small>
        </div>

        <div className="management-actions">
          <button className="management-button" disabled={busy}>
            {busy ? copy.common.saving : copy.form.save}
          </button>

          <button
            type="button"
            className="management-button-secondary"
            onClick={onCancel}
          >
            {copy.form.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
