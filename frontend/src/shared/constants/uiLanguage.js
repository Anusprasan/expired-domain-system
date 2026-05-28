import { MANAGEMENT_UI_COPY } from "./managementUiCopy";

export const PREFERRED_LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "indonesian", label: "Bahasa Indonesia" },
];

export function normalizeUiLanguage(value) {
  return value === "indonesian" ? "indonesian" : "english";
}

const UI_COPY = {
  english: {
    profile: {
      language: {
        sectionTitle: "Language Preference",
        sectionDescription:
          "Choose your interface language. For now, this applies to dashboard, user management, group management, privilege management, database backups, website analytics, website snapshots, activity logs, brands, notifications, sidebar, Money Site Checker, Screenshot Taker, Short Link Checker, LP Servers, Content Pool, Development, and Reporting sections.",
        fieldLabel: "Language",
        saveButton: "Save Language",
        savingButton: "Saving...",
        successMessage: "Language preference updated successfully.",
        errorMessage: "Failed to update language preference",
      },
    },
    sidebar: {
      collapseSidebar: "Collapse sidebar",
      expandSidebar: "Expand sidebar",
      globalDateTitle: "Global Date",
      today: "Today",
      globalDateCopy: "This date filter syncs across reporting, development, and logs.",
      openGlobalDateFilter: "Open global date filter",
      profileOptions: "Profile options",
      myProfile: "My Profile",
      logout: "Logout",
      switchToDarkMode: "Switch to dark mode",
      switchToLightMode: "Switch to light mode",
      darkMode: "Dark mode",
      lightMode: "Light mode",
      nav: {
        "/dashboard": { label: "Dashboard", description: "Overview and access summary" },
        "/brands": { label: "Brands", description: "Manage tracked brand records" },
        "/money-sites": { label: "Money Site Checker", description: "Manage money sites" },
        "/screenshot-taker": { label: "Screenshot Taker", description: "Capture previews of assigned websites" },
        "/short-link-checker": { label: "Short Link Checker", description: "Check short links and alert on HTTP errors" },
        "/cuttly-link-checker": { label: "Cutt.ly Link Checker", description: "Check Cutt.ly blocked-domain status with API alerts" },
        "/lp-servers": { label: "LP Servers", description: "Manage landing page server hosting details" },
        "/development": { label: "Development", description: "Manage development workflows" },
        "/article-pool": { label: "Content Pool", description: "Create and manage brand content" },
        "/reporting": { label: "Reporting", description: "View reports and performance snapshots" },
        "/tasks": { label: "Tasks", description: "Track operational work items" },
        "/users": { label: "Users", description: "Maintain user accounts and assignments" },
        "/groups": { label: "Groups", description: "Organize teams and access groups" },
        "/privileges": { label: "Privileges", description: "Review role permissions" },
        "/database-backups": { label: "Database Backups", description: "Create, download, and restore full MongoDB backups" },
        "/site-analytics": { label: "Website Analytics", description: "Track visits and clicks from external HTML and AMP pages" },
        "/website-snapshots": { label: "Website Snapshots", description: "Search old website versions and download archived ZIP snapshots" },
        "/activity-logs": { label: "Activity Logs", description: "Review login, navigation, and action history" },
        "/rank-checker": { label: "Rank Checker", description: "Run SEO rank checks and manage service automation" },
        "/seo-tools": { label: "SEO Tools", description: "Access SEO utility workflows" },
        "/mail-server": { label: "Mail Server", description: "Monitor mail configuration" },
      },
    },
    ...MANAGEMENT_UI_COPY.english,
    dashboard: {
      page: {
        loadingTitle: "Dashboard",
        loadingDescription: "Loading your role-based workspace overview...",
        loadErrorFallback: "Unable to load dashboard.",
        notificationsTitle: "Notifications",
        notificationsDescription: "The most important live operational signals across your workspace.",
        openAction: "Open",
        noActiveNotifications: "No active notifications right now.",
        quickActionsTitle: "Quick Actions",
        quickActionsDescriptionAdmin: "Jump straight into the most common administrative tasks.",
        quickActionsDescriptionUser: "Open the tools and workflows available to your account.",
        noQuickActions: "No quick actions are available for this account.",
      },
      header: {
        title: "Dashboard",
        welcome: (name) => `Welcome back, ${name}`,
        adminSubtitle: "Monitor users, access, development progress, and the latest system activity from one place.",
        userSubtitle: "Track your recent work, jump into the modules you can access, and keep your account up to date.",
      },
      quickActions: {
        "manage-users": { label: "Manage Users", description: "Create accounts, update assignments, and control account status." },
        "manage-groups": { label: "Manage Groups", description: "Maintain protected groups and role-based access." },
        "manage-brands": { label: "Manage Brands", description: "Review and maintain tracked brand records." },
        "money-sites": { label: "Money Site Checker", description: "Track money-site status, blocked alerts, and cleanup actions." },
        "lp-servers": { label: "Manage LP Servers", description: "Manage hosting details, servers, and configurations." },
        "development-board": { label: "Development Board", description: "Track domain progress, assignments, and delivery state." },
        "audit-logs": { label: "Review Activity Logs", description: "Inspect the most recent actions across the workspace." },
        profile: { label: "My Profile", description: "Update personal information and security settings." },
      },
      summaryCards: {
        "total-users": { label: "Total Users", description: (n) => `${n[0] || 0} active users currently able to access the workspace` },
        groups: { label: "Access Groups", description: (n) => `${n[0] || 0} protected groups managed by the system` },
        brands: { label: "Tracked Brands", description: () => "Brands available for management and downstream workflows" },
        "money-sites-total": { label: "Total Money Sites", description: (n) => `${n[0] || 0} clear, ${n[1] || 0} not checked` },
        "money-sites-blocked": { label: "Blocked Money Sites", description: () => "Live blocked count from the checker feed" },
        domains: { label: "Development Domains", description: (n) => `${n[0] || 0} in progress, ${n[1] || 0} completed` },
        resets: { label: "Pending Resets", description: () => "Password reset requests waiting for admin action" },
        "my-access": { label: "Accessible Modules", description: () => "Workspace areas currently available to your account" },
        "my-permissions": { label: "Permissions", description: () => "Privileges inherited from your assigned group" },
        "my-work": { label: "Assigned Domains", description: (n) => `${n[0] || 0} in progress, ${n[1] || 0} completed` },
        "my-activity": { label: "Recent Activity", description: () => "Actions recorded for your account over the last 14 days" },
      },
      alerts: {
        "pending-resets": { title: "Pending password reset approvals", message: (n) => `${n[0] || 0} reset request${(n[0] || 0) === 1 ? "" : "s"} waiting for review.` },
        "inactive-users": { title: "Inactive accounts detected", message: (n) => `${n[0] || 0} user account${(n[0] || 0) === 1 ? "" : "s"} currently inactive.` },
        "unassigned-domains": { title: "Unassigned development workload", message: (n) => `${n[0] || 0} domain${(n[0] || 0) === 1 ? "" : "s"} do not have an assigned developer.` },
        "blocked-money-sites": { title: "Blocked money sites detected", message: (n) => `${n[0] || 0} money site${(n[0] || 0) === 1 ? "" : "s"} currently show as blocked.` },
        "protected-groups": { title: "Protected access groups", message: (n) => `${n[0] || 0} protected group${(n[0] || 0) === 1 ? "" : "s"} locked against deletion.` },
        "open-work": { title: "Open assigned work", message: (n) => `${n[0] || 0} assigned domain${(n[0] || 0) === 1 ? "" : "s"} still need progress.` },
        "permissions-summary": { title: "Access is group-based", message: (n, groupName) => `${n[0] || 0} privilege${(n[0] || 0) === 1 ? "" : "s"} inherited from ${groupName || "your current group"}.` },
        "profile-reminder": { title: "Keep your profile current", message: () => "Use the profile panel to update your username and password when needed." },
      },
      notificationCenter: {
        unknown: "Unknown", justNow: "Just now", newPasswordRequired: "A new password is required.", resetCompleted: "Password reset completed.", resetFailed: "Failed to reset password", requestMarkedRead: "Password reset request marked as read.", requestMarkReadFailed: "Failed to mark request as read", allResetsMarkedRead: "All password reset requests marked as read.", allResetsMarkReadFailed: "Failed to mark requests as read", allMoneySitesMarkedRead: "All money-site notifications marked as read.", buttonAria: (count) => `Notifications${count ? ` (${count} unread)` : ""}`, blockedPreviewSingleTitle: "Blocked money site detected", blockedPreviewMultiTitle: (count) => `${count} money sites blocked`, modalEyebrow: "Notifications", modalTitle: "Notification Center", modalDescription: "See the notifications you have access to from one place.", refreshAll: "Refresh all", refreshingAll: "Refreshing...", close: "Close", unreadNotifications: "Unread Notifications", blockedMoneySites: "Blocked Money Sites", passwordResetRequests: "Password Reset Requests", openMoneySites: "Open Money Sites", markMoneySiteAlertsRead: "Mark money-site alerts read", markPasswordResetsRead: "Mark password resets read", working: "Working...", loadingNotifications: "Loading notifications...", noNotifications: "No notifications available right now.", moneySiteMonitoringTitle: "Money-site monitoring", moneySitesKind: "Money Sites", moneySiteSummaryBlocked: (blocked, total) => `${blocked} blocked in total across ${total} monitored money sites.`, moneySiteSummaryUnread: (count) => `${count} unread live alert${count === 1 ? "" : "s"}.`, moneySiteSummaryClear: "No active blocked money sites right now.", updatedAt: (value) => `Updated ${value}`, watchingLive: "Watching live checker activity", latestPrefix: "Latest", blockedPill: (count) => `${count} blocked`, markAsRead: "Mark as read", passwordResetKind: "Password Reset", requestedAt: (value) => `Requested ${value}`, hideResetForm: "Hide reset form", resetPassword: "Reset password", newPasswordLabel: "New password", newPasswordPlaceholder: "Enter a temporary or final password", adminNotesLabel: "Admin notes", adminNotesPlaceholder: "Optional note for the reset record", confirmReset: "Confirm reset", resetting: "Resetting...", cancel: "Cancel",
      },
      moneySiteNotification: {
        justNow: "Just now", unknownBrand: "Unknown brand", toastSingle: (domain) => `${domain} was marked as blocked.`, toastMultiple: (count) => `${count} money sites were marked as blocked.`, buttonAria: (count) => `Money site alerts${count ? ` (${count} blocked)` : ""}`, modalEyebrow: "Notifications", title: "Blocked money sites", description: "Live checker alerts across the system. This list updates even when you are not on the money-sites page.", refresh: "Refresh", refreshing: "Refreshing...", openMoneySites: "Open Money Sites", close: "Close", blocked: "Blocked", totalMoneySites: "Total Money Sites", notBlocked: "Not Blocked", loading: "Loading blocked money sites...", empty: "No money sites are currently blocked.", checkedAt: (value) => `Checked ${value}`,
      },
      passwordResetNotification: {
        unknown: "Unknown", buttonAria: (count) => `Password reset notifications${count ? ` (${count} pending)` : ""}`, modalEyebrow: "Notifications", title: "Password reset requests", description: "Review pending user requests and set a new password directly from the dashboard.", refresh: "Refresh", refreshing: "Refreshing...", clearAll: "Clear all", clearingAll: "Clearing...", close: "Close", loading: "Loading pending password reset requests...", empty: "No pending password reset requests.", requestedAt: (value) => `Requested ${value}`, hideResetForm: "Hide reset form", resetPassword: "Reset password", clear: "Clear", working: "Working...", newPasswordRequired: "A new password is required.", resetCompleted: "Password reset completed.", resetFailed: "Failed to reset password", clearSuccess: "Password reset notification cleared.", clearFailed: "Failed to clear notification", clearAllSuccess: "All password reset notifications cleared.", clearAllFailed: "Failed to clear notifications", newPasswordLabel: "New password", newPasswordPlaceholder: "Enter a temporary or final password", adminNotesLabel: "Admin notes", adminNotesPlaceholder: "Optional note for the reset record", confirmReset: "Confirm reset", resetting: "Resetting...", cancel: "Cancel",
      },
    },
    brands: {
      page: {
        title: "Brand Management", description: "Create brand records, manage their visual styles, and search existing definitions from one workspace.", createBrand: "Create Brand", totalBrands: "Total brands", loadingTitle: "Loading", loadingDescription: "Fetching brands...", loadErrorFallback: "Unable to load brands.", updateSuccess: "Brand updated successfully.", createSuccess: "Brand created successfully.", saveError: "Failed to save brand", deleteSuccess: "Brand deleted successfully.", deleteError: "Failed to delete brand", editPermissionError: "You do not have permission to edit brands.", deletePermissionError: "You do not have permission to delete brands.", deleteTitle: "Delete Brand", deleteConfirm: (name) => `Delete ${name}? This action cannot be undone.`, deleteButton: "Delete",
      },
      form: {
        titleCreate: "Create Brand", titleEdit: "Edit Brand", description: "Manage brand visuals and display treatments used throughout the platform.", previewFallback: "BRAND PREVIEW", brandName: "Brand Name", backgroundStyle: "Background Style", backgroundColor: "Background Color", textColor: "Text Color", gradientDirection: "Gradient Direction", decreaseGradientDirection: "Decrease gradient direction", increaseGradientDirection: "Increase gradient direction", gradientPosition: "Gradient Position", gradientStops: "Gradient Stops", solid: "Solid", linearGradient: "Linear Gradient", radialGradient: "Radial Gradient", saveCreate: "Create Brand", saveEdit: "Save Brand", saving: "Saving...", cancel: "Cancel",
        errors: { brandNameRequired: "Brand name is required.", brandExists: "Brand name already exists.", backgroundColorRequired: "Background color is required for solid brands.", gradientStopsRequired: "Enter at least two gradient stops.", gradientDirectionRequired: "Gradient direction is required.", gradientPositionRequired: "Gradient position is required.", textColorRequired: "Text color is required." },
        gradientPositions: { "circle at center": "Center", "circle at top": "Top", "circle at bottom": "Bottom", "circle at left": "Left", "circle at right": "Right", "circle at top left": "Top Left", "circle at top right": "Top Right", "circle at bottom left": "Bottom Left", "circle at bottom right": "Bottom Right", "ellipse at center": "Ellipse Center", "ellipse at top": "Ellipse Top", "ellipse at bottom": "Ellipse Bottom", "ellipse at left": "Ellipse Left", "ellipse at right": "Ellipse Right", "ellipse at top left": "Ellipse Top Left", "ellipse at top right": "Ellipse Top Right", "ellipse at bottom left": "Ellipse Bottom Left", "ellipse at bottom right": "Ellipse Bottom Right", "circle closest-side at center": "Circle Closest Side", "circle farthest-side at center": "Circle Farthest Side", "circle closest-corner at center": "Circle Closest Corner", "circle farthest-corner at center": "Circle Farthest Corner", "ellipse closest-side at center": "Ellipse Closest Side", "ellipse farthest-side at center": "Ellipse Farthest Side", "ellipse closest-corner at center": "Ellipse Closest Corner", "ellipse farthest-corner at center": "Ellipse Farthest Corner" },
      },
      table: {
        title: "Brands", description: "Search and manage brand records, visual styling, and reusable CSS identifiers.", search: "Search", searchPlaceholder: "Search name, class, or style", headers: { brand: "Brand", preview: "Preview", style: "Style", actions: "Actions" }, edit: "Edit", delete: "Delete", empty: "No brands found.", noMatches: "No matching brands found.",
      },
    },
  },
  indonesian: {
    profile: {
      language: {
        sectionTitle: "Preferensi Bahasa",
        sectionDescription:
          "Pilih bahasa antarmuka Anda. Untuk sekarang, ini berlaku untuk dasbor, manajemen pengguna, manajemen grup, manajemen hak akses, backup database, analitik website, snapshot website, log aktivitas, brand, notifikasi, sidebar, bagian pengecek Nawala, Pengambil Screenshot, Pengecek Short Link, Server LP, Kumpulan Konten, Pengembangan, dan Pelaporan.",
        fieldLabel: "Bahasa",
        saveButton: "Simpan Bahasa",
        savingButton: "Menyimpan...",
        successMessage: "Preferensi bahasa berhasil diperbarui.",
        errorMessage: "Gagal memperbarui preferensi bahasa",
      },
    },
    sidebar: {
      collapseSidebar: "Ciutkan sidebar",
      expandSidebar: "Perluas sidebar",
      globalDateTitle: "Tanggal Global",
      today: "Hari ini",
      globalDateCopy: "Filter tanggal ini tersinkron di pelaporan, pengembangan, dan log.",
      openGlobalDateFilter: "Buka filter tanggal global",
      profileOptions: "Opsi profil",
      myProfile: "Profil Saya",
      logout: "Keluar",
      switchToDarkMode: "Ubah ke mode gelap",
      switchToLightMode: "Ubah ke mode terang",
      darkMode: "Mode gelap",
      lightMode: "Mode terang",
      nav: {
        "/dashboard": { label: "Dasbor", description: "Ringkasan umum dan akses" },
        "/brands": { label: "Brand", description: "Kelola data brand yang dipantau" },
        "/money-sites": { label: "Pengecek Nawala", description: "Kelola situs uang" },
        "/screenshot-taker": { label: "Pengambil Screenshot", description: "Ambil pratinjau situs web yang ditugaskan" },
        "/short-link-checker": { label: "Pengecek Short Link", description: "Cek short link dan kirim alert error HTTP" },
        "/cuttly-link-checker": { label: "Pengecek Link Cutt.ly", description: "Cek status domain terblokir Cutt.ly dengan alert API" },
        "/lp-servers": { label: "Server LP", description: "Kelola detail hosting server landing page" },
        "/development": { label: "Pengembangan", description: "Kelola alur kerja pengembangan" },
        "/article-pool": { label: "Kumpulan Konten", description: "Buat dan kelola konten brand" },
        "/reporting": { label: "Pelaporan", description: "Lihat laporan dan ringkasan performa" },
        "/tasks": { label: "Tugas", description: "Pantau item pekerjaan operasional" },
        "/users": { label: "Pengguna", description: "Kelola akun pengguna dan penugasan" },
        "/groups": { label: "Grup", description: "Atur tim dan grup akses" },
        "/privileges": { label: "Hak Akses", description: "Tinjau izin peran" },
        "/database-backups": { label: "Backup Database", description: "Buat, unduh, dan restore backup MongoDB penuh" },
        "/site-analytics": { label: "Analitik Website", description: "Pantau kunjungan dan klik dari halaman HTML dan AMP eksternal" },
        "/website-snapshots": { label: "Snapshot Website", description: "Cari versi website lama dan unduh snapshot ZIP arsip" },
        "/activity-logs": { label: "Log Aktivitas", description: "Tinjau riwayat login, navigasi, dan tindakan" },
        "/rank-checker": { label: "Pengecek Peringkat", description: "Jalankan pengecekan SEO dan kelola otomasi layanan" },
        "/seo-tools": { label: "Alat SEO", description: "Akses alur utilitas SEO" },
        "/mail-server": { label: "Server Mail", description: "Pantau konfigurasi mail" },
      },
    },
    ...MANAGEMENT_UI_COPY.indonesian,
    dashboard: {
      page: {
        loadingTitle: "Dasbor",
        loadingDescription: "Memuat ringkasan ruang kerja berdasarkan peran Anda...",
        loadErrorFallback: "Gagal memuat dasbor.",
        notificationsTitle: "Notifikasi",
        notificationsDescription: "Sinyal operasional langsung yang paling penting di ruang kerja Anda.",
        openAction: "Buka",
        noActiveNotifications: "Tidak ada notifikasi aktif saat ini.",
        quickActionsTitle: "Aksi Cepat",
        quickActionsDescriptionAdmin: "Langsung buka tugas administrasi yang paling sering digunakan.",
        quickActionsDescriptionUser: "Buka alat dan alur kerja yang tersedia untuk akun Anda.",
        noQuickActions: "Tidak ada aksi cepat untuk akun ini.",
      },
      header: {
        title: "Dasbor",
        welcome: (name) => `Selamat datang kembali, ${name}`,
        adminSubtitle: "Pantau pengguna, akses, progres pengembangan, dan aktivitas sistem terbaru dari satu tempat.",
        userSubtitle: "Pantau pekerjaan terbaru Anda, buka modul yang bisa diakses, dan jaga akun Anda tetap terbaru.",
      },
      quickActions: {
        "manage-users": { label: "Kelola Pengguna", description: "Buat akun, perbarui penugasan, dan kontrol status akun." },
        "manage-groups": { label: "Kelola Grup", description: "Kelola grup terlindungi dan akses berbasis peran." },
        "manage-brands": { label: "Kelola Brand", description: "Tinjau dan kelola data brand yang dipantau." },
        "money-sites": { label: "Pengecek Nawala", description: "Pantau status situs uang, alert blokir, dan tindakan pembersihan." },
        "lp-servers": { label: "Kelola Server LP", description: "Kelola detail hosting, server, dan konfigurasi." },
        "development-board": { label: "Papan Pengembangan", description: "Pantau progres domain, penugasan, dan status pengerjaan." },
        "audit-logs": { label: "Tinjau Log Aktivitas", description: "Periksa tindakan terbaru di seluruh ruang kerja." },
        profile: { label: "Profil Saya", description: "Perbarui informasi pribadi dan pengaturan keamanan." },
      },
      summaryCards: {
        "total-users": { label: "Total Pengguna", description: (n) => `${n[0] || 0} pengguna aktif saat ini dapat mengakses ruang kerja` },
        groups: { label: "Grup Akses", description: (n) => `${n[0] || 0} grup terlindungi dikelola oleh sistem` },
        brands: { label: "Brand Dipantau", description: () => "Brand tersedia untuk pengelolaan dan alur kerja lanjutan" },
        "money-sites-total": { label: "Total Situs Uang", description: (n) => `${n[0] || 0} aman, ${n[1] || 0} belum dicek` },
        "money-sites-blocked": { label: "Situs Uang Terblokir", description: () => "Jumlah blokir langsung dari feed pengecek" },
        domains: { label: "Domain Pengembangan", description: (n) => `${n[0] || 0} sedang dikerjakan, ${n[1] || 0} selesai` },
        resets: { label: "Reset Tertunda", description: () => "Permintaan reset kata sandi menunggu tindakan admin" },
        "my-access": { label: "Modul yang Bisa Diakses", description: () => "Area ruang kerja yang tersedia untuk akun Anda" },
        "my-permissions": { label: "Hak Akses", description: () => "Hak akses yang diwarisi dari grup Anda" },
        "my-work": { label: "Domain Ditugaskan", description: (n) => `${n[0] || 0} sedang dikerjakan, ${n[1] || 0} selesai` },
        "my-activity": { label: "Aktivitas Terbaru", description: () => "Tindakan akun Anda selama 14 hari terakhir" },
      },
      alerts: {
        "pending-resets": { title: "Persetujuan reset kata sandi tertunda", message: (n) => `${n[0] || 0} permintaan reset menunggu ditinjau.` },
        "inactive-users": { title: "Akun tidak aktif terdeteksi", message: (n) => `${n[0] || 0} akun pengguna saat ini tidak aktif.` },
        "unassigned-domains": { title: "Beban kerja pengembangan belum ditugaskan", message: (n) => `${n[0] || 0} domain belum memiliki developer yang ditugaskan.` },
        "blocked-money-sites": { title: "Situs uang terblokir terdeteksi", message: (n) => `${n[0] || 0} situs uang saat ini tampil sebagai terblokir.` },
        "protected-groups": { title: "Grup akses terlindungi", message: (n) => `${n[0] || 0} grup terlindungi dikunci agar tidak dapat dihapus.` },
        "open-work": { title: "Pekerjaan yang masih terbuka", message: (n) => `${n[0] || 0} domain yang ditugaskan masih perlu progres.` },
        "permissions-summary": { title: "Akses berbasis grup", message: (n, groupName) => `${n[0] || 0} hak akses diwarisi dari ${groupName || "grup Anda saat ini"}.` },
        "profile-reminder": { title: "Jaga profil Anda tetap terbaru", message: () => "Gunakan panel profil untuk memperbarui nama pengguna dan kata sandi saat diperlukan." },
      },
      notificationCenter: {
        unknown: "Tidak diketahui", justNow: "Baru saja", newPasswordRequired: "Kata sandi baru wajib diisi.", resetCompleted: "Reset kata sandi selesai.", resetFailed: "Gagal mereset kata sandi", requestMarkedRead: "Permintaan reset kata sandi ditandai sudah dibaca.", requestMarkReadFailed: "Gagal menandai permintaan sebagai dibaca", allResetsMarkedRead: "Semua permintaan reset kata sandi ditandai sudah dibaca.", allResetsMarkReadFailed: "Gagal menandai semua permintaan sebagai dibaca", allMoneySitesMarkedRead: "Semua notifikasi situs uang ditandai sudah dibaca.", buttonAria: (count) => `Notifikasi${count ? ` (${count} belum dibaca)` : ""}`, blockedPreviewSingleTitle: "Situs uang terblokir terdeteksi", blockedPreviewMultiTitle: (count) => `${count} situs uang terblokir`, modalEyebrow: "Notifikasi", modalTitle: "Pusat Notifikasi", modalDescription: "Lihat notifikasi yang bisa Anda akses dari satu tempat.", refreshAll: "Muat ulang semua", refreshingAll: "Memuat...", close: "Tutup", unreadNotifications: "Notifikasi Belum Dibaca", blockedMoneySites: "Situs Uang Terblokir", passwordResetRequests: "Permintaan Reset Kata Sandi", openMoneySites: "Buka Situs Uang", markMoneySiteAlertsRead: "Tandai alert situs uang dibaca", markPasswordResetsRead: "Tandai reset kata sandi dibaca", working: "Memproses...", loadingNotifications: "Memuat notifikasi...", noNotifications: "Tidak ada notifikasi saat ini.", moneySiteMonitoringTitle: "Pemantauan situs uang", moneySitesKind: "Situs Uang", moneySiteSummaryBlocked: (blocked, total) => `${blocked} terblokir dari total ${total} situs uang yang dipantau.`, moneySiteSummaryUnread: (count) => `${count} alert langsung belum dibaca.`, moneySiteSummaryClear: "Tidak ada situs uang aktif yang terblokir saat ini.", updatedAt: (value) => `Diperbarui ${value}`, watchingLive: "Memantau aktivitas pengecek langsung", latestPrefix: "Terbaru", blockedPill: (count) => `${count} terblokir`, markAsRead: "Tandai dibaca", passwordResetKind: "Reset Kata Sandi", requestedAt: (value) => `Diminta ${value}`, hideResetForm: "Sembunyikan formulir reset", resetPassword: "Reset kata sandi", newPasswordLabel: "Kata sandi baru", newPasswordPlaceholder: "Masukkan kata sandi sementara atau final", adminNotesLabel: "Catatan admin", adminNotesPlaceholder: "Catatan opsional untuk reset ini", confirmReset: "Konfirmasi reset", resetting: "Mereset...", cancel: "Batal",
      },
      moneySiteNotification: {
        justNow: "Baru saja", unknownBrand: "Brand tidak diketahui", toastSingle: (domain) => `${domain} ditandai sebagai terblokir.`, toastMultiple: (count) => `${count} situs uang ditandai sebagai terblokir.`, buttonAria: (count) => `Alert situs uang${count ? ` (${count} terblokir)` : ""}`, modalEyebrow: "Notifikasi", title: "Situs uang terblokir", description: "Alert pengecek langsung di seluruh sistem. Daftar ini tetap diperbarui meskipun Anda tidak sedang berada di halaman situs uang.", refresh: "Muat ulang", refreshing: "Memuat...", openMoneySites: "Buka Situs Uang", close: "Tutup", blocked: "Terblokir", totalMoneySites: "Total Situs Uang", notBlocked: "Tidak Terblokir", loading: "Memuat situs uang terblokir...", empty: "Tidak ada situs uang yang sedang terblokir.", checkedAt: (value) => `Diperiksa ${value}`,
      },
      passwordResetNotification: {
        unknown: "Tidak diketahui", buttonAria: (count) => `Notifikasi reset kata sandi${count ? ` (${count} tertunda)` : ""}`, modalEyebrow: "Notifikasi", title: "Permintaan reset kata sandi", description: "Tinjau permintaan pengguna yang tertunda dan atur kata sandi baru langsung dari dasbor.", refresh: "Muat ulang", refreshing: "Memuat...", clearAll: "Hapus semua", clearingAll: "Menghapus...", close: "Tutup", loading: "Memuat permintaan reset kata sandi yang tertunda...", empty: "Tidak ada permintaan reset kata sandi yang tertunda.", requestedAt: (value) => `Diminta ${value}`, hideResetForm: "Sembunyikan formulir reset", resetPassword: "Reset kata sandi", clear: "Hapus", working: "Memproses...", newPasswordRequired: "Kata sandi baru wajib diisi.", resetCompleted: "Reset kata sandi selesai.", resetFailed: "Gagal mereset kata sandi", clearSuccess: "Notifikasi reset kata sandi dihapus.", clearFailed: "Gagal menghapus notifikasi", clearAllSuccess: "Semua notifikasi reset kata sandi dihapus.", clearAllFailed: "Gagal menghapus notifikasi", newPasswordLabel: "Kata sandi baru", newPasswordPlaceholder: "Masukkan kata sandi sementara atau final", adminNotesLabel: "Catatan admin", adminNotesPlaceholder: "Catatan opsional untuk reset ini", confirmReset: "Konfirmasi reset", resetting: "Mereset...", cancel: "Batal",
      },
    },
    brands: {
      page: {
        title: "Manajemen Brand", description: "Buat data brand, kelola gaya visualnya, dan cari definisi yang sudah ada dari satu tempat.", createBrand: "Buat Brand", totalBrands: "Total brand", loadingTitle: "Memuat", loadingDescription: "Mengambil data brand...", loadErrorFallback: "Gagal memuat brand.", updateSuccess: "Brand berhasil diperbarui.", createSuccess: "Brand berhasil dibuat.", saveError: "Gagal menyimpan brand", deleteSuccess: "Brand berhasil dihapus.", deleteError: "Gagal menghapus brand", editPermissionError: "Anda tidak memiliki izin untuk mengedit brand.", deletePermissionError: "Anda tidak memiliki izin untuk menghapus brand.", deleteTitle: "Hapus Brand", deleteConfirm: (name) => `Hapus ${name}? Tindakan ini tidak dapat dibatalkan.`, deleteButton: "Hapus",
      },
      form: {
        titleCreate: "Buat Brand", titleEdit: "Edit Brand", description: "Kelola tampilan visual brand yang digunakan di seluruh platform.", previewFallback: "PRATINJAU BRAND", brandName: "Nama Brand", backgroundStyle: "Gaya Latar", backgroundColor: "Warna Latar", textColor: "Warna Teks", gradientDirection: "Arah Gradien", decreaseGradientDirection: "Kurangi arah gradien", increaseGradientDirection: "Tambah arah gradien", gradientPosition: "Posisi Gradien", gradientStops: "Titik Gradien", solid: "Solid", linearGradient: "Gradien Linear", radialGradient: "Gradien Radial", saveCreate: "Buat Brand", saveEdit: "Simpan Brand", saving: "Menyimpan...", cancel: "Batal",
        errors: { brandNameRequired: "Nama brand wajib diisi.", brandExists: "Nama brand sudah ada.", backgroundColorRequired: "Warna latar wajib diisi untuk brand solid.", gradientStopsRequired: "Masukkan minimal dua titik gradien.", gradientDirectionRequired: "Arah gradien wajib diisi.", gradientPositionRequired: "Posisi gradien wajib diisi.", textColorRequired: "Warna teks wajib diisi." },
        gradientPositions: { "circle at center": "Tengah", "circle at top": "Atas", "circle at bottom": "Bawah", "circle at left": "Kiri", "circle at right": "Kanan", "circle at top left": "Kiri Atas", "circle at top right": "Kanan Atas", "circle at bottom left": "Kiri Bawah", "circle at bottom right": "Kanan Bawah", "ellipse at center": "Elips Tengah", "ellipse at top": "Elips Atas", "ellipse at bottom": "Elips Bawah", "ellipse at left": "Elips Kiri", "ellipse at right": "Elips Kanan", "ellipse at top left": "Elips Kiri Atas", "ellipse at top right": "Elips Kanan Atas", "ellipse at bottom left": "Elips Kiri Bawah", "ellipse at bottom right": "Elips Kanan Bawah", "circle closest-side at center": "Lingkaran Sisi Terdekat", "circle farthest-side at center": "Lingkaran Sisi Terjauh", "circle closest-corner at center": "Lingkaran Sudut Terdekat", "circle farthest-corner at center": "Lingkaran Sudut Terjauh", "ellipse closest-side at center": "Elips Sisi Terdekat", "ellipse farthest-side at center": "Elips Sisi Terjauh", "ellipse closest-corner at center": "Elips Sudut Terdekat", "ellipse farthest-corner at center": "Elips Sudut Terjauh" },
      },
      table: {
        title: "Brand", description: "Cari dan kelola data brand, gaya visual, serta pengenal CSS yang dapat dipakai ulang.", search: "Cari", searchPlaceholder: "Cari nama, kelas, atau gaya", headers: { brand: "Brand", preview: "Pratinjau", style: "Gaya", actions: "Aksi" }, edit: "Edit", delete: "Hapus", empty: "Belum ada brand.", noMatches: "Tidak ada brand yang cocok.",
      },
    },
  },
};

export function getAppUiCopy(language) {
  return UI_COPY[normalizeUiLanguage(language)];
}

export function getNavItemCopy(item, language) {
  const copy = getAppUiCopy(language);
  const translated = copy.sidebar?.nav?.[item.path];

  if (!translated) {
    return item;
  }

  return {
    ...item,
    label: translated.label,
    description: translated.description,
  };
}

function extractNumbers(text) {
  return String(text || "")
    .match(/\d+/g)
    ?.map((value) => Number(value)) || [];
}

export function localizeDashboardData(dashboard, language, user) {
  if (!dashboard) {
    return dashboard;
  }

  const copy = getAppUiCopy(language).dashboard;
  const role = dashboard.role === "admin" ? "admin" : "user";

  return {
    ...dashboard,
    header: {
      ...dashboard.header,
      title: copy.header.title,
      welcome: copy.header.welcome(user?.fullName || ""),
      subtitle: role === "admin" ? copy.header.adminSubtitle : copy.header.userSubtitle,
    },
    summaryCards: (dashboard.summaryCards || []).map((card) => {
      const cardCopy = copy.summaryCards[card.id];
      if (!cardCopy) {
        return card;
      }

      return {
        ...card,
        label: cardCopy.label,
        description: cardCopy.description(extractNumbers(card.description)),
      };
    }),
    quickActions: (dashboard.quickActions || []).map((action) => {
      const actionCopy = copy.quickActions[action.id];
      if (!actionCopy) {
        return action;
      }

      return {
        ...action,
        label: actionCopy.label,
        description: actionCopy.description,
      };
    }),
    alerts: (dashboard.alerts || []).map((alert) => {
      const alertCopy = copy.alerts[alert.id];
      if (!alertCopy) {
        return alert;
      }

      return {
        ...alert,
        title: alertCopy.title,
        message: alertCopy.message(
          extractNumbers(alert.message),
          user?.group?.name || user?.groupId?.name
        ),
      };
    }),
  };
}
