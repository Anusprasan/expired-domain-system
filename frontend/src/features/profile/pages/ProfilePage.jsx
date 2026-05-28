import React, { useCallback, useEffect, useMemo, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { hasAdminAccess, hasAnyPrivilege } from "../../../shared/utils/permissions";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  getAppUiCopy,
  PREFERRED_LANGUAGE_OPTIONS,
} from "../../../shared/constants/uiLanguage";
import { MONEY_SITE_PRIVILEGES } from "../../money-sites/constants/moneySitePrivileges";
import { useMoneySitePushSubscription } from "../../money-sites/hooks/useMoneySitePushSubscription";
import {
  changeMyPasswordApi,
  createTelegramBotApi,
  deleteTelegramBotApi,
  getProfileApi,
  testTelegramBotApi,
  updateProfileApi,
  updateTelegramBotApi,
} from "../api/profileApi";
import "../../../shared/styles/management.css";

function formatDateTime(value, language, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(language === "indonesian" ? "id-ID" : undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatTelegramTestState(bot, profileCopy, language) {
  if (!bot?.lastTestAt) {
    return profileCopy.telegram.noTestYet;
  }

  const suffix = formatDateTime(bot.lastTestAt, language, profileCopy.summary.noLoginActivity);

  if (bot.lastTestStatus === "success") {
    return profileCopy.telegram.lastTestPassed(suffix);
  }

  if (bot.lastTestStatus === "failed") {
    return profileCopy.telegram.lastTestFailed(suffix);
  }

  return profileCopy.telegram.lastTestGeneric(suffix);
}

const EMPTY_PASSWORD_FORM = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const EMPTY_TELEGRAM_FORM = {
  name: "",
  botUsername: "",
  chatId: "",
  botToken: "",
  isActive: true,
};

const PROFILE_PAGE_COPY = {
  english: {
    pageTitle: "My Profile",
    pageDescription:
      "Review your account details, privileges, password, and personal notification settings.",
    loadingTitle: "Loading",
    loadingDescription: "Fetching profile details...",
    loadFailed: "Failed to load profile",
    tabs: {
      account: "Account",
      alerts: "Alerts & Integrations",
    },
    summary: {
      noLoginActivity: "No login activity yet",
      noGroupAssigned: "No group assigned",
      username: "Username",
      lastLogin: "Last Login",
      privilegesTitle: "Privileges",
      privilegesDescription: "Privileges inherited from your assigned group.",
      noPrivileges: "No privileges assigned.",
    },
    account: {
      usernameTitle: "Change Username",
      usernameDescription: "Update the display name used across the application.",
      usernameLabel: "Username",
      saving: "Saving...",
      saveUsername: "Save Username",
      usernameUpdated: "Username updated successfully.",
      usernameUpdateFailed: "Failed to update username",
      passwordTitle: "Change Password",
      passwordDescription: "Use your current password to set a new one for this account.",
      currentPassword: "Current Password",
      newPassword: "New Password",
      confirmPassword: "Confirm New Password",
      savePassword: "Save Password",
      passwordUpdated: "Password updated successfully.",
      passwordUpdateFailed: "Failed to update password",
      passwordMismatch: "New password and confirm password must match.",
    },
    alerts: {
      notificationsUnsupported: "This browser does not support desktop notifications.",
      browserNotificationsEnabled: "Browser notifications enabled for Nawala alerts.",
      notificationsBlocked:
        "Browser notifications are blocked. Open browser/site settings to allow them again.",
      notificationsNotGranted: "Notification permission was not granted.",
      notificationsRequestFailed: "Unable to request browser notification permission.",
      openBrowserSettings: "Open your browser settings and allow notifications for this site.",
      backgroundAlertsEnabled: "Background alerts enabled successfully.",
      sectionTitle: "Nawala Background Alerts",
      sectionDescription:
        "Manage browser permission and background push alerts for blocked money-site updates.",
      browser: "Browser",
      push: "Push",
      permissionUnsupported: "Unsupported",
      permissionEnabled: "Enabled",
      permissionBlocked: "Blocked",
      permissionNotEnabled: "Not Enabled",
      pushServerOff: "Server Off",
      pushDisabled: "Disabled",
      notificationSettings: "Notification Settings",
      checking: "Checking...",
      enableBrowserNotifications: "Enable Browser Notifications",
      enabling: "Enabling...",
      enableBackgroundAlerts: "Enable Background Alerts",
      working: "Working...",
      disableBackgroundAlerts: "Disable Background Alerts",
      helpText:
        "Browser notifications must be allowed first. After that, enable background alerts to receive Nawala push notifications even when the page is not open.",
    },
    telegram: {
      sectionTitle: "Global Telegram Bots",
      sectionDescription:
        "Admin only. Add shared Telegram bots here for future system-wide notifications and integrations.",
      noBotUsername: "No bot username saved",
      active: "Active",
      paused: "Paused",
      chatId: "Chat ID",
      token: "Token",
      stored: "Stored",
      missing: "Missing",
      status: "Status",
      message: "Message",
      edit: "Edit",
      updating: "Updating...",
      pause: "Pause",
      activate: "Activate",
      testing: "Testing...",
      sendTest: "Send Test",
      deleting: "Deleting...",
      delete: "Delete",
      empty: "No global Telegram bots configured yet.",
      editTitle: "Edit Global Telegram Bot",
      addTitle: "Add Global Telegram Bot",
      formDescription:
        "Use the bot token from BotFather and the target chat or group ID that should receive alerts.",
      botName: "Bot Name",
      botUsername: "Bot Username",
      chatIdLabel: "Chat ID",
      botToken: "Bot Token",
      leaveBlankKeepToken: "(leave blank to keep current token)",
      keepExistingToken: "Keep existing token",
      activeForNotifications: "Bot active for notifications",
      activeHelp: "Active bots are used for future live notification delivery.",
      saveBot: "Save Bot",
      addBot: "Add Bot",
      cancelEdit: "Cancel Edit",
      noTestYet: "No test sent yet",
      lastTestPassed: (suffix) => `Last test passed ${suffix}`,
      lastTestFailed: (suffix) => `Last test failed ${suffix}`,
      lastTestGeneric: (suffix) => `Last test ${suffix}`,
      updatedSuccess: "Telegram bot updated successfully.",
      addedSuccess: "Telegram bot added successfully.",
      saveFailed: "Failed to save Telegram bot",
      toggledSuccess: (nextActive) =>
        `Telegram bot ${nextActive ? "activated" : "paused"} successfully.`,
      toggleFailed: "Failed to update Telegram bot status",
      deletedSuccess: "Telegram bot deleted successfully.",
      deleteFailed: "Failed to delete Telegram bot",
      testSuccess: "Telegram test message sent successfully.",
      testFailed: "Failed to send Telegram test message",
    },
  },
  indonesian: {
    pageTitle: "Profil Saya",
    pageDescription:
      "Tinjau detail akun, hak akses, kata sandi, dan pengaturan notifikasi pribadi Anda.",
    loadingTitle: "Memuat",
    loadingDescription: "Mengambil detail profil...",
    loadFailed: "Gagal memuat profil",
    tabs: {
      account: "Akun",
      alerts: "Alert & Integrasi",
    },
    summary: {
      noLoginActivity: "Belum ada aktivitas login",
      noGroupAssigned: "Belum ada grup",
      username: "Nama Pengguna",
      lastLogin: "Login Terakhir",
      privilegesTitle: "Hak Akses",
      privilegesDescription: "Hak akses yang diwarisi dari grup Anda.",
      noPrivileges: "Belum ada hak akses.",
    },
    account: {
      usernameTitle: "Ubah Nama Pengguna",
      usernameDescription: "Perbarui nama tampilan yang digunakan di seluruh aplikasi.",
      usernameLabel: "Nama Pengguna",
      saving: "Menyimpan...",
      saveUsername: "Simpan Nama Pengguna",
      usernameUpdated: "Nama pengguna berhasil diperbarui.",
      usernameUpdateFailed: "Gagal memperbarui nama pengguna",
      passwordTitle: "Ubah Kata Sandi",
      passwordDescription: "Gunakan kata sandi saat ini untuk menetapkan kata sandi baru untuk akun ini.",
      currentPassword: "Kata Sandi Saat Ini",
      newPassword: "Kata Sandi Baru",
      confirmPassword: "Konfirmasi Kata Sandi Baru",
      savePassword: "Simpan Kata Sandi",
      passwordUpdated: "Kata sandi berhasil diperbarui.",
      passwordUpdateFailed: "Gagal memperbarui kata sandi",
      passwordMismatch: "Kata sandi baru dan konfirmasi kata sandi harus sama.",
    },
    alerts: {
      notificationsUnsupported: "Browser ini tidak mendukung notifikasi desktop.",
      browserNotificationsEnabled: "Notifikasi browser untuk alert Nawala berhasil diaktifkan.",
      notificationsBlocked:
        "Notifikasi browser diblokir. Buka pengaturan browser/situs untuk mengizinkannya lagi.",
      notificationsNotGranted: "Izin notifikasi tidak diberikan.",
      notificationsRequestFailed: "Tidak dapat meminta izin notifikasi browser.",
      openBrowserSettings: "Buka pengaturan browser Anda dan izinkan notifikasi untuk situs ini.",
      backgroundAlertsEnabled: "Alert latar belakang berhasil diaktifkan.",
      sectionTitle: "Alert Latar Belakang Nawala",
      sectionDescription:
        "Kelola izin browser dan push alert latar belakang untuk pembaruan situs uang yang diblokir.",
      browser: "Browser",
      push: "Push",
      permissionUnsupported: "Tidak Didukung",
      permissionEnabled: "Aktif",
      permissionBlocked: "Diblokir",
      permissionNotEnabled: "Belum Aktif",
      pushServerOff: "Server Mati",
      pushDisabled: "Nonaktif",
      notificationSettings: "Pengaturan Notifikasi",
      checking: "Memeriksa...",
      enableBrowserNotifications: "Aktifkan Notifikasi Browser",
      enabling: "Mengaktifkan...",
      enableBackgroundAlerts: "Aktifkan Alert Latar Belakang",
      working: "Memproses...",
      disableBackgroundAlerts: "Nonaktifkan Alert Latar Belakang",
      helpText:
        "Notifikasi browser harus diizinkan terlebih dahulu. Setelah itu, aktifkan alert latar belakang untuk menerima push notifikasi Nawala bahkan saat halaman tidak terbuka.",
    },
    telegram: {
      sectionTitle: "Bot Telegram Global",
      sectionDescription:
        "Hanya admin. Tambahkan bot Telegram bersama di sini untuk notifikasi dan integrasi sistem di masa depan.",
      noBotUsername: "Username bot belum disimpan",
      active: "Aktif",
      paused: "Dijeda",
      chatId: "Chat ID",
      token: "Token",
      stored: "Tersimpan",
      missing: "Tidak Ada",
      status: "Status",
      message: "Pesan",
      edit: "Edit",
      updating: "Memperbarui...",
      pause: "Jeda",
      activate: "Aktifkan",
      testing: "Menguji...",
      sendTest: "Kirim Uji",
      deleting: "Menghapus...",
      delete: "Hapus",
      empty: "Belum ada bot Telegram global yang dikonfigurasi.",
      editTitle: "Edit Bot Telegram Global",
      addTitle: "Tambah Bot Telegram Global",
      formDescription:
        "Gunakan token bot dari BotFather dan chat atau group ID tujuan yang harus menerima alert.",
      botName: "Nama Bot",
      botUsername: "Username Bot",
      chatIdLabel: "Chat ID",
      botToken: "Token Bot",
      leaveBlankKeepToken: "(biarkan kosong untuk tetap memakai token saat ini)",
      keepExistingToken: "Gunakan token yang ada",
      activeForNotifications: "Bot aktif untuk notifikasi",
      activeHelp: "Bot aktif digunakan untuk pengiriman notifikasi langsung berikutnya.",
      saveBot: "Simpan Bot",
      addBot: "Tambah Bot",
      cancelEdit: "Batal Edit",
      noTestYet: "Belum ada pesan uji",
      lastTestPassed: (suffix) => `Uji terakhir berhasil ${suffix}`,
      lastTestFailed: (suffix) => `Uji terakhir gagal ${suffix}`,
      lastTestGeneric: (suffix) => `Uji terakhir ${suffix}`,
      updatedSuccess: "Bot Telegram berhasil diperbarui.",
      addedSuccess: "Bot Telegram berhasil ditambahkan.",
      saveFailed: "Gagal menyimpan bot Telegram",
      toggledSuccess: (nextActive) =>
        `Bot Telegram berhasil ${nextActive ? "diaktifkan" : "dijeda"}.`,
      toggleFailed: "Gagal memperbarui status bot Telegram",
      deletedSuccess: "Bot Telegram berhasil dihapus.",
      deleteFailed: "Gagal menghapus bot Telegram",
      testSuccess: "Pesan uji Telegram berhasil dikirim.",
      testFailed: "Gagal mengirim pesan uji Telegram",
    },
  },
};

export default function ProfilePage() {
  const { refreshCurrentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [busySection, setBusySection] = useState("");
  const [fullName, setFullName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("english");
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [activeSettingsTab, setActiveSettingsTab] = useState("account");
  const [editingTelegramBotId, setEditingTelegramBotId] = useState("");
  const [telegramForm, setTelegramForm] = useState(EMPTY_TELEGRAM_FORM);
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof window === "undefined") {
      return "unsupported";
    }

    if (!("Notification" in window)) {
      return "unsupported";
    }

    return window.Notification.permission;
  });
  const profileCopy =
    PROFILE_PAGE_COPY[preferredLanguage === "indonesian" ? "indonesian" : "english"];

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getProfileApi();
      setProfile(data.data);
      setFullName(data.data.fullName || "");
      setPreferredLanguage(data.data.preferredLanguage || data.data.moneySiteLanguage || "english");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleProfileRefresh = useCallback(async () => {
    const data = await getProfileApi();
    setProfile(data.data);
    setFullName(data.data.fullName || "");
    setPreferredLanguage(data.data.preferredLanguage || data.data.moneySiteLanguage || "english");
    await refreshCurrentUser();
  }, [refreshCurrentUser]);

  const canManageMoneySiteAlerts = useMemo(
    () => hasAnyPrivilege(profile, MONEY_SITE_PRIVILEGES),
    [profile]
  );
  const canManageTelegramBots = useMemo(
    () => Boolean(profile?.canManageTelegramBots || hasAdminAccess(profile)),
    [profile]
  );
  const availableTabs = useMemo(() => {
    const tabs = [{ id: "account", label: profileCopy.tabs.account }];

    if (canManageMoneySiteAlerts || canManageTelegramBots) {
      tabs.push({ id: "alerts", label: profileCopy.tabs.alerts });
    }

    return tabs;
  }, [canManageMoneySiteAlerts, canManageTelegramBots, profileCopy.tabs.account, profileCopy.tabs.alerts]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeSettingsTab)) {
      setActiveSettingsTab(availableTabs[0]?.id || "account");
    }
  }, [activeSettingsTab, availableTabs]);

  const handlePushError = useCallback((message) => {
    if (message) {
      setError(message);
    }
  }, []);

  const handlePushSuccess = useCallback((message) => {
    if (message) {
      setSuccessMessage(message);
    }
  }, []);

  const {
    pushSupported,
    pushConfigured,
    pushSubscribed,
    pushLoading,
    syncPushSubscription,
    unsubscribePushSubscription,
  } = useMoneySitePushSubscription({
    enabled: canManageMoneySiteAlerts,
    permission: notificationPermission,
    onError: handlePushError,
    onSuccess: handlePushSuccess,
  });

  const syncNotificationPermission = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(window.Notification.permission);
  }, []);

  useEffect(() => {
    syncNotificationPermission();

    if (typeof window === "undefined") {
      return undefined;
    }

    const handleWindowFocus = () => syncNotificationPermission();
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncNotificationPermission();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncNotificationPermission]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setError(profileCopy.alerts.notificationsUnsupported);
      return;
    }

    try {
      setBusySection("notification-permission");
      setError("");
      setSuccessMessage("");

      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === "granted") {
        setSuccessMessage(profileCopy.alerts.browserNotificationsEnabled);
        await syncPushSubscription({ subscribeIfMissing: true, reportErrors: true });
        return;
      }

      if (permission === "denied") {
        setError(profileCopy.alerts.notificationsBlocked);
        return;
      }

      setError(profileCopy.alerts.notificationsNotGranted);
    } catch {
      setError(profileCopy.alerts.notificationsRequestFailed);
    } finally {
      setBusySection("");
    }
  }, [profileCopy.alerts, syncPushSubscription]);

  const openNotificationSettings = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const userAgent = window.navigator.userAgent.toLowerCase();

    if (userAgent.includes("edg/")) {
      window.open("edge://settings/content/notifications", "_blank");
      return;
    }

    if (userAgent.includes("chrome")) {
      window.open("chrome://settings/content/notifications", "_blank");
      return;
    }

    if (userAgent.includes("firefox")) {
      window.open("about:preferences#privacy", "_blank");
      return;
    }

    setError(profileCopy.alerts.openBrowserSettings);
  }, [profileCopy.alerts.openBrowserSettings]);

  const resetTelegramForm = useCallback(() => {
    setEditingTelegramBotId("");
    setTelegramForm(EMPTY_TELEGRAM_FORM);
  }, []);

  const handleNameSubmit = async (event) => {
    event.preventDefault();

    try {
      setBusySection("name");
      setError("");
      setSuccessMessage("");
      await updateProfileApi({ fullName });
      await handleProfileRefresh();
      setSuccessMessage(profileCopy.account.usernameUpdated);
    } catch (err) {
      setError(err.response?.data?.message || profileCopy.account.usernameUpdateFailed);
    } finally {
      setBusySection("");
    }
  };

  const handleMoneySiteLanguageSubmit = async (event) => {
    event.preventDefault();

    try {
      setBusySection("money-site-language");
      setError("");
      setSuccessMessage("");
      await updateProfileApi({
        fullName,
        preferredLanguage,
      });
      await handleProfileRefresh();
      setSuccessMessage(languagePreferenceCopy.successMessage);
    } catch (err) {
      setError(err.response?.data?.message || languagePreferenceCopy.errorMessage);
    } finally {
      setBusySection("");
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError(profileCopy.account.passwordMismatch);
      return;
    }

    try {
      setBusySection("password");
      setError("");
      setSuccessMessage("");
      await changeMyPasswordApi({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm(EMPTY_PASSWORD_FORM);
      await handleProfileRefresh();
      setSuccessMessage(profileCopy.account.passwordUpdated);
    } catch (err) {
      setError(err.response?.data?.message || profileCopy.account.passwordUpdateFailed);
    } finally {
      setBusySection("");
    }
  };

  const handleTelegramSubmit = async (event) => {
    event.preventDefault();

    try {
      setBusySection(editingTelegramBotId ? "telegram-update" : "telegram-create");
      setError("");
      setSuccessMessage("");

      if (editingTelegramBotId) {
        await updateTelegramBotApi(editingTelegramBotId, telegramForm);
        setSuccessMessage(profileCopy.telegram.updatedSuccess);
      } else {
        await createTelegramBotApi(telegramForm);
        setSuccessMessage(profileCopy.telegram.addedSuccess);
      }

      resetTelegramForm();
      await handleProfileRefresh();
    } catch (err) {
      setError(err.response?.data?.message || profileCopy.telegram.saveFailed);
    } finally {
      setBusySection("");
    }
  };

  const handleTelegramEdit = (bot) => {
    setEditingTelegramBotId(bot._id || bot.id || "");
    setTelegramForm({
      name: bot.name || "",
      botUsername: bot.botUsername || "",
      chatId: bot.chatId || "",
      botToken: "",
      isActive: Boolean(bot.isActive),
    });
    setActiveSettingsTab("alerts");
  };

  const handleTelegramToggle = async (bot) => {
    try {
      const botId = bot._id || bot.id;
      setBusySection(`telegram-toggle-${botId}`);
      setError("");
      setSuccessMessage("");

      await updateTelegramBotApi(botId, {
        name: bot.name,
        botUsername: bot.botUsername,
        chatId: bot.chatId,
        botToken: "",
        isActive: !bot.isActive,
      });

      await handleProfileRefresh();
      setSuccessMessage(
        profileCopy.telegram.toggledSuccess(!bot.isActive)
      );
    } catch (err) {
      setError(err.response?.data?.message || profileCopy.telegram.toggleFailed);
    } finally {
      setBusySection("");
    }
  };

  const handleTelegramDelete = async (bot) => {
    try {
      const botId = bot._id || bot.id;
      setBusySection(`telegram-delete-${botId}`);
      setError("");
      setSuccessMessage("");
      await deleteTelegramBotApi(botId);
      if (editingTelegramBotId === botId) {
        resetTelegramForm();
      }
      await handleProfileRefresh();
      setSuccessMessage(profileCopy.telegram.deletedSuccess);
    } catch (err) {
      setError(err.response?.data?.message || profileCopy.telegram.deleteFailed);
    } finally {
      setBusySection("");
    }
  };

  const handleTelegramTest = async (bot) => {
    try {
      const botId = bot._id || bot.id;
      setBusySection(`telegram-test-${botId}`);
      setError("");
      setSuccessMessage("");
      await testTelegramBotApi(botId);
      await handleProfileRefresh();
      setSuccessMessage(profileCopy.telegram.testSuccess);
    } catch (err) {
      setError(err.response?.data?.message || profileCopy.telegram.testFailed);
    } finally {
      setBusySection("");
    }
  };

  const handleEnableBackgroundAlerts = async () => {
    try {
      setBusySection("push-enable");
      setError("");
      setSuccessMessage("");
      const subscribed = await syncPushSubscription({ subscribeIfMissing: true, reportErrors: true });

      if (subscribed) {
        setSuccessMessage(profileCopy.alerts.backgroundAlertsEnabled);
      }
    } finally {
      setBusySection("");
    }
  };

  const handleDisableBackgroundAlerts = async () => {
    try {
      setBusySection("push-disable");
      setError("");
      setSuccessMessage("");
      await unsubscribePushSubscription();
    } finally {
      setBusySection("");
    }
  };

  const telegramBots = profile?.telegramBots || [];
  const languagePreferenceCopy = getAppUiCopy(preferredLanguage).profile.language;

  return (
    <div className="management-page">
      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice message={successMessage} onClose={() => setSuccessMessage("")} tone="success" />

      <section className="app-panel management-header">
        <div>
          <h1>{profileCopy.pageTitle}</h1>
          <p>{profileCopy.pageDescription}</p>
        </div>
      </section>

      {loading ? (
        <section className="app-panel management-state">
          <h2>{profileCopy.loadingTitle}</h2>
          <p>{profileCopy.loadingDescription}</p>
        </section>
      ) : profile ? (
        <div className="management-grid profile-page-grid">
          <section className="app-panel management-form profile-summary-panel">
            <div className="profile-hero">
              <span className="profile-hero-avatar" aria-hidden="true">
                {(profile.fullName || "A").slice(0, 1).toUpperCase()}
              </span>
              <div className="profile-hero-copy">
                <h2>{profile.fullName}</h2>
                <p>{profile.email}</p>
                <span>{profile.group?.name || profileCopy.summary.noGroupAssigned}</span>
              </div>
            </div>

            <div className="profile-detail-grid">
              <article className="profile-detail-card">
                <span className="profile-detail-label">{profileCopy.summary.username}</span>
                <strong>{profile.fullName}</strong>
              </article>
              <article className="profile-detail-card">
                <span className="profile-detail-label">{profileCopy.summary.lastLogin}</span>
                <strong>
                  {formatDateTime(
                    profile.lastLoginAt,
                    preferredLanguage,
                    profileCopy.summary.noLoginActivity
                  )}
                </strong>
              </article>
            </div>

            <div className="profile-privileges-panel" id="permissions-summary">
              <div className="management-section-header profile-section-header">
                <div>
                  <h2>{profileCopy.summary.privilegesTitle}</h2>
                  <p>{profileCopy.summary.privilegesDescription}</p>
                </div>
              </div>
              <div className="profile-privilege-list">
                {(profile.group?.privileges || []).map((privilege) => (
                  <span key={privilege._id || privilege.key} className="management-badge profile-privilege-badge">
                    {privilege.name}
                  </span>
                ))}
                {!profile.group?.privileges?.length ? (
                  <p className="management-empty">{profileCopy.summary.noPrivileges}</p>
                ) : null}
              </div>
            </div>
          </section>

          <div className="profile-settings-stack">
            {availableTabs.length > 1 ? (
              <div
                className="profile-settings-tabs"
                role="tablist"
                aria-label={`${profileCopy.pageTitle} tabs`}
              >
                {availableTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeSettingsTab === tab.id}
                    className={`profile-settings-tab${activeSettingsTab === tab.id ? " is-active" : ""}`}
                    onClick={() => setActiveSettingsTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}

            {activeSettingsTab === "account" ? (
              <>
                <section className="app-panel management-form" id="change-username">
                  <h2>{profileCopy.account.usernameTitle}</h2>
                  <p>{profileCopy.account.usernameDescription}</p>

                  <form onSubmit={handleNameSubmit} className="management-fields">
                    <div className="management-field">
                      <label htmlFor="profile-full-name">{profileCopy.account.usernameLabel}</label>
                      <input
                        id="profile-full-name"
                        name="fullName"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        required
                      />
                    </div>

                    <div className="management-actions">
                      <button type="submit" className="management-button" disabled={busySection === "name"}>
                        {busySection === "name"
                          ? profileCopy.account.saving
                          : profileCopy.account.saveUsername}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="app-panel management-form" id="money-site-language">
                  <h2>{languagePreferenceCopy.sectionTitle}</h2>
                  <p>{languagePreferenceCopy.sectionDescription}</p>

                  <form onSubmit={handleMoneySiteLanguageSubmit} className="management-fields">
                    <div className="management-field">
                      <label htmlFor="profile-money-site-language">{languagePreferenceCopy.fieldLabel}</label>
                      <select
                        id="profile-money-site-language"
                        value={preferredLanguage}
                        onChange={(event) => setPreferredLanguage(event.target.value)}
                      >
                        {PREFERRED_LANGUAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="management-actions">
                      <button
                        type="submit"
                        className="management-button"
                        disabled={busySection === "money-site-language"}
                      >
                        {busySection === "money-site-language"
                          ? languagePreferenceCopy.savingButton
                          : languagePreferenceCopy.saveButton}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="app-panel management-form" id="change-password">
                  <h2>{profileCopy.account.passwordTitle}</h2>
                  <p>{profileCopy.account.passwordDescription}</p>

                  <form onSubmit={handlePasswordSubmit} className="management-fields">
                    <div className="management-field">
                      <label htmlFor="profile-current-password">{profileCopy.account.currentPassword}</label>
                      <input
                        id="profile-current-password"
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(event) =>
                          setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                        }
                        required
                      />
                    </div>

                    <div className="management-field">
                      <label htmlFor="profile-new-password">{profileCopy.account.newPassword}</label>
                      <input
                        id="profile-new-password"
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(event) =>
                          setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                        }
                        required
                      />
                    </div>

                    <div className="management-field">
                      <label htmlFor="profile-confirm-password">{profileCopy.account.confirmPassword}</label>
                      <input
                        id="profile-confirm-password"
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(event) =>
                          setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                        }
                        required
                      />
                    </div>

                    <div className="management-actions">
                      <button type="submit" className="management-button" disabled={busySection === "password"}>
                        {busySection === "password"
                          ? profileCopy.account.saving
                          : profileCopy.account.savePassword}
                      </button>
                    </div>
                  </form>
                </section>
              </>
            ) : null}
            {activeSettingsTab === "alerts" ? (
              <>
                {canManageMoneySiteAlerts ? (
                  <section className="app-panel management-form profile-alerts-panel">
                    <div className="profile-settings-card-header">
                      <div>
                        <h2>{profileCopy.alerts.sectionTitle}</h2>
                        <p>{profileCopy.alerts.sectionDescription}</p>
                      </div>
                    </div>

                    <div className="profile-status-pill-row">
                      <span className={`management-badge${notificationPermission === "granted" ? " is-active" : " is-inactive"}`}>
                        {profileCopy.alerts.browser}:{" "}
                        {notificationPermission === "unsupported"
                          ? profileCopy.alerts.permissionUnsupported
                          : notificationPermission === "granted"
                            ? profileCopy.alerts.permissionEnabled
                            : notificationPermission === "denied"
                              ? profileCopy.alerts.permissionBlocked
                              : profileCopy.alerts.permissionNotEnabled}
                      </span>
                      <span className={`management-badge${pushSubscribed ? " is-active" : " is-inactive"}`}>
                        {profileCopy.alerts.push}:{" "}
                        {!pushSupported
                          ? profileCopy.alerts.permissionUnsupported
                          : !pushConfigured
                            ? profileCopy.alerts.pushServerOff
                            : pushSubscribed
                              ? profileCopy.alerts.permissionEnabled
                              : profileCopy.alerts.pushDisabled}
                      </span>
                    </div>

                    <div className="management-actions profile-settings-actions">
                      {notificationPermission === "denied" ? (
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={openNotificationSettings}
                        >
                          {profileCopy.alerts.notificationSettings}
                        </button>
                      ) : null}

                      {notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={requestNotificationPermission}
                          disabled={busySection === "notification-permission"}
                        >
                          {busySection === "notification-permission"
                            ? profileCopy.alerts.checking
                            : profileCopy.alerts.enableBrowserNotifications}
                        </button>
                      ) : null}

                      {notificationPermission === "granted" && pushSupported && pushConfigured && !pushSubscribed ? (
                        <button
                          type="button"
                          className="management-button"
                          onClick={() => void handleEnableBackgroundAlerts()}
                          disabled={pushLoading || busySection === "push-enable"}
                        >
                          {pushLoading || busySection === "push-enable"
                            ? profileCopy.alerts.enabling
                            : profileCopy.alerts.enableBackgroundAlerts}
                        </button>
                      ) : null}

                      {notificationPermission === "granted" && pushSupported && pushSubscribed ? (
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={() => void handleDisableBackgroundAlerts()}
                          disabled={pushLoading || busySection === "push-disable"}
                        >
                          {pushLoading || busySection === "push-disable"
                            ? profileCopy.alerts.working
                            : profileCopy.alerts.disableBackgroundAlerts}
                        </button>
                      ) : null}
                    </div>

                    <p className="profile-help-text">
                      {profileCopy.alerts.helpText}
                    </p>
                  </section>
                ) : null}

                {canManageTelegramBots ? (
                  <section className="app-panel management-form profile-telegram-panel">
                    <div className="profile-settings-card-header">
                      <div>
                        <h2>{profileCopy.telegram.sectionTitle}</h2>
                        <p>{profileCopy.telegram.sectionDescription}</p>
                      </div>
                    </div>

                    <div className="profile-telegram-list">
                      {telegramBots.length ? (
                        telegramBots.map((bot) => {
                          const botId = bot._id || bot.id;

                          return (
                            <article key={botId} className="profile-telegram-card">
                              <div className="profile-telegram-card-header">
                                <div>
                                  <h3>{bot.name}</h3>
                                  <p>
                                    {bot.botUsername
                                      ? `@${bot.botUsername}`
                                      : profileCopy.telegram.noBotUsername}
                                  </p>
                                </div>
                                <span className={`management-badge${bot.isActive ? " is-active" : " is-inactive"}`}>
                                  {bot.isActive ? profileCopy.telegram.active : profileCopy.telegram.paused}
                                </span>
                              </div>

                              <div className="profile-telegram-meta">
                                <span><strong>{profileCopy.telegram.chatId}:</strong> {bot.chatId}</span>
                                <span>
                                  <strong>{profileCopy.telegram.token}:</strong>{" "}
                                  {bot.hasStoredToken
                                    ? profileCopy.telegram.stored
                                    : profileCopy.telegram.missing}
                                </span>
                                <span>
                                  <strong>{profileCopy.telegram.status}:</strong>{" "}
                                  {formatTelegramTestState(bot, profileCopy, preferredLanguage)}
                                </span>
                                {bot.lastTestMessage ? (
                                  <span>
                                    <strong>{profileCopy.telegram.message}:</strong> {bot.lastTestMessage}
                                  </span>
                                ) : null}
                              </div>

                              <div className="management-actions profile-settings-actions">
                                <button
                                  type="button"
                                  className="management-button-secondary"
                                  onClick={() => handleTelegramEdit(bot)}
                                >
                                  {profileCopy.telegram.edit}
                                </button>
                                <button
                                  type="button"
                                  className="management-button-secondary"
                                  onClick={() => void handleTelegramToggle(bot)}
                                  disabled={busySection === `telegram-toggle-${botId}`}
                                >
                                  {busySection === `telegram-toggle-${botId}`
                                    ? profileCopy.telegram.updating
                                    : bot.isActive
                                      ? profileCopy.telegram.pause
                                      : profileCopy.telegram.activate}
                                </button>
                                <button
                                  type="button"
                                  className="management-button-secondary"
                                  onClick={() => void handleTelegramTest(bot)}
                                  disabled={busySection === `telegram-test-${botId}`}
                                >
                                  {busySection === `telegram-test-${botId}`
                                    ? profileCopy.telegram.testing
                                    : profileCopy.telegram.sendTest}
                                </button>
                                <button
                                  type="button"
                                  className="management-button-secondary"
                                  onClick={() => void handleTelegramDelete(bot)}
                                  disabled={busySection === `telegram-delete-${botId}`}
                                >
                                  {busySection === `telegram-delete-${botId}`
                                    ? profileCopy.telegram.deleting
                                    : profileCopy.telegram.delete}
                                </button>
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <p className="management-empty">{profileCopy.telegram.empty}</p>
                      )}
                    </div>

                    <form onSubmit={handleTelegramSubmit} className="management-fields profile-telegram-form">
                      <div className="profile-settings-card-header">
                        <div>
                          <h3>
                            {editingTelegramBotId
                              ? profileCopy.telegram.editTitle
                              : profileCopy.telegram.addTitle}
                          </h3>
                          <p>{profileCopy.telegram.formDescription}</p>
                        </div>
                      </div>

                      <div className="management-field-grid">
                        <div className="management-field">
                          <label htmlFor="profile-telegram-name">{profileCopy.telegram.botName}</label>
                          <input
                            id="profile-telegram-name"
                            value={telegramForm.name}
                            onChange={(event) =>
                              setTelegramForm((current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder={profileCopy.telegram.botName}
                            required
                          />
                        </div>

                        <div className="management-field">
                          <label htmlFor="profile-telegram-username">{profileCopy.telegram.botUsername}</label>
                          <input
                            id="profile-telegram-username"
                            value={telegramForm.botUsername}
                            onChange={(event) =>
                              setTelegramForm((current) => ({ ...current, botUsername: event.target.value }))
                            }
                            placeholder="@my_alert_bot"
                          />
                        </div>
                      </div>

                      <div className="management-field-grid">
                        <div className="management-field">
                          <label htmlFor="profile-telegram-chat-id">{profileCopy.telegram.chatIdLabel}</label>
                          <input
                            id="profile-telegram-chat-id"
                            value={telegramForm.chatId}
                            onChange={(event) =>
                              setTelegramForm((current) => ({ ...current, chatId: event.target.value }))
                            }
                            placeholder="-1001234567890"
                            required
                          />
                        </div>

                        <div className="management-field">
                          <label htmlFor="profile-telegram-token">
                            {profileCopy.telegram.botToken}{" "}
                            {editingTelegramBotId ? profileCopy.telegram.leaveBlankKeepToken : ""}
                          </label>
                          <input
                            id="profile-telegram-token"
                            type="password"
                            value={telegramForm.botToken}
                            onChange={(event) =>
                              setTelegramForm((current) => ({ ...current, botToken: event.target.value }))
                            }
                            placeholder={
                              editingTelegramBotId
                                ? profileCopy.telegram.keepExistingToken
                                : "123456:ABCDEF..."
                            }
                            required={!editingTelegramBotId}
                          />
                        </div>
                      </div>

                      <label className="management-checkbox profile-inline-checkbox">
                        <input
                          type="checkbox"
                          checked={telegramForm.isActive}
                          onChange={(event) =>
                            setTelegramForm((current) => ({ ...current, isActive: event.target.checked }))
                          }
                        />
                        <span className="management-checkbox-copy">
                          <strong>{profileCopy.telegram.activeForNotifications}</strong>
                          <span className="management-checkbox-meta">
                            {profileCopy.telegram.activeHelp}
                          </span>
                        </span>
                      </label>

                      <div className="management-actions profile-settings-actions">
                        <button
                          type="submit"
                          className="management-button"
                          disabled={busySection === "telegram-create" || busySection === "telegram-update"}
                        >
                          {busySection === "telegram-create" || busySection === "telegram-update"
                            ? profileCopy.account.saving
                            : editingTelegramBotId
                              ? profileCopy.telegram.saveBot
                              : profileCopy.telegram.addBot}
                        </button>
                        {editingTelegramBotId ? (
                          <button
                            type="button"
                            className="management-button-secondary"
                            onClick={resetTelegramForm}
                          >
                            {profileCopy.telegram.cancelEdit}
                          </button>
                        ) : null}
                      </div>
                    </form>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
