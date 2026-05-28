export const DATABASE_BACKUPS_UI_COPY = {
  english: {
    databaseBackups: {
      page: {
        title: "Database Backups",
        description:
          "Create full MongoDB backups, download archived restore points, and restore safely with Telegram verification plus an automatic safety backup.",
        refresh: "Refresh",
        refreshing: "Refreshing...",
        exportAction: "Create & Download Backup",
        exporting: "Creating Backup...",
        loadingDescription:
          "Loading backup history, latest restore points, and backup bot configuration...",
        loadErrorFallback: "Failed to load database backups",
        storageHint:
          "Backups are stored on the server in the database-backups folder. Restore always creates a fresh safety backup before replacing live data.",
      },
      overview: {
        latestBackupDay: "Latest Backup Day",
        latestBackupTime: "Latest Backup Time",
        latestSafetyBackup: "Latest Safety Backup",
        totalBackups: "Saved Backups",
        availableBackups: "Available Files",
        totalStorage: "Storage Used",
        noBackupYet: "No backup yet",
        neverCreated: "Not created yet",
      },
      list: {
        title: "Backup Library",
        description:
          "Use a saved backup to download, review, or restore. Safety backups created during restore are kept here as well.",
        protectionHint: (count) =>
          `The newest ${count} backups are protected and cannot be deleted.`,
        filteredCount: (count, total) =>
          count === total ? `${total} backups` : `${count} of ${total} backups`,
        empty: "No database backups are available yet.",
        noMatches: "No backups match the current filters.",
        createdAt: "Created",
        createdBy: "Created By",
        databaseName: "Database",
        fileSize: "Archive Size",
        backupType: "Backup Type",
        status: "File Status",
        lastRestored: "Last Restored",
        sourceBackup: "Safety backup for",
        note: "Note",
        noCreator: "System",
        neverRestored: "Never restored",
        missingFileHelp:
          "The backup record exists, but the archive file is missing from the server folder.",
      },
      filters: {
        fromDate: "From Date",
        toDate: "To Date",
        type: "Backup Type",
        allTypes: "All types",
        manualOnly: "Manual backups",
        safetyOnly: "Safety backups",
      },
      actions: {
        download: "Download",
        downloading: "Downloading...",
        sendTelegram: "Send To Telegram",
        sendingTelegram: "Sending...",
        delete: "Delete",
        deleting: "Deleting...",
        protected: "Protected",
        restore: "Restore",
        requestCode: "Send Telegram Code",
        sendingCode: "Sending Code...",
        restoreNow: "Download Safety Backup & Restore",
        preparingRestore: "Preparing...",
        configureBot: "Configure Bot",
        saveBot: "Save Bot Settings",
        savingBot: "Saving...",
        testBot: "Send Test",
        testingBot: "Testing...",
      },
      restore: {
        title: "Restore Database Backup",
        description:
          "Restore is protected with a Telegram code. Before live data is replaced, the current database is backed up and downloaded as a safety archive.",
        selectedBackup: "Selected Backup",
        verificationCode: "Telegram Code",
        verificationCodePlaceholder: "Enter 4-digit code",
        verificationHint:
          "Request a code first. The restore button will create a fresh safety backup, download it, and only then continue with the restore.",
        codeSentAt: "Code sent",
        codeExpiresAt: "Code expires",
        safetyBackupReady: "Safety backup ready",
        safetyBackupDownload: (slug) => `Downloading safety backup ${slug} before restore...`,
        confirmRestore: (slug) =>
          `Restore backup ${slug}? The current database will be backed up first, downloaded, and then replaced.`,
        success: (selectedSlug, safetySlug) =>
          `Database restored from ${selectedSlug}. Safety backup ${safetySlug} was created first.`,
        stepPreparing: "Creating safety backup...",
        stepRestoring: "Restoring database...",
        latestProtection:
          "The current database is protected automatically before every restore attempt.",
      },
      telegram: {
        title: "Restore Verification Bot",
        description:
          "Admin only. Configure the Telegram bot used to send restore verification codes before database restore starts.",
        enabled: "Enable Telegram restore verification",
        enabledHelp:
          "When enabled, restore requests must receive a 4-digit code through this bot before restore can continue, and completed backup archives are also shared to the configured chats in the background.",
        botToken: "Bot Token",
        botTokenPlaceholder: "123456:ABCDEF...",
        keepExistingToken: "Leave blank to keep the saved token",
        clearSavedToken: "Clear saved bot token",
        chatIds: "Chat IDs",
        chatIdsPlaceholder: "-1001234567890\n123456789",
        chatIdsHelp:
          "Add one chat ID per line or separate multiple IDs with commas.",
        statusEnabled: "Verification enabled",
        statusDisabled: "Verification disabled",
        tokenStored: "Token stored",
        tokenMissing: "Token missing",
        chatCount: "Chat destinations",
        lastSentAt: "Last Telegram send",
        lastError: "Last error",
        noErrors: "No recent delivery errors",
        updateSuccess: "Database backup Telegram settings saved.",
        testSuccess: "Database backup Telegram test message sent.",
        loadErrorFallback: "Failed to load Telegram restore bot settings",
        saveErrorFallback: "Failed to save Telegram restore bot settings",
        testErrorFallback: "Failed to send Telegram restore bot test message",
      },
      statuses: {
        manual: "Manual Backup",
        preRestore: "Safety Backup",
        available: "Available",
        missing: "Missing",
      },
      messages: {
        exportSuccess: (slug) => `Full database backup ${slug} created and download started.`,
        exportCreatedDownloadFailed: (slug) =>
          `Backup ${slug} was created, but the download could not be started automatically.`,
        downloadStarted: (slug) => `Download started for backup ${slug}.`,
        sendTelegramSuccess: (slug, sentCount, failedCount) =>
          failedCount
            ? `Backup ${slug} was sent to ${sentCount} Telegram chat(s). ${failedCount} delivery attempt(s) failed.`
            : `Backup ${slug} was sent to ${sentCount} Telegram chat(s).`,
        deleteSuccess: (slug) => `Backup ${slug} was deleted.`,
        restoreCodeSent: "Telegram restore code sent successfully.",
        noBackupSelected: "Choose a backup before continuing.",
        verificationCodeRequired: "Enter the 4-digit Telegram verification code.",
        restoreCancelled: "Restore cancelled.",
      },
      confirmations: {
        delete: (slug, count) =>
          `Delete backup ${slug}? The newest ${count} backups will remain protected.`,
      },
      misc: {
        yes: "Yes",
        no: "No",
      },
    },
  },
  indonesian: {
    databaseBackups: {
      page: {
        title: "Backup Database",
        description:
          "Buat backup MongoDB penuh, unduh titik restore yang tersimpan, dan lakukan restore dengan aman memakai verifikasi Telegram serta safety backup otomatis.",
        refresh: "Muat Ulang",
        refreshing: "Memuat...",
        exportAction: "Buat & Unduh Backup",
        exporting: "Membuat Backup...",
        loadingDescription:
          "Memuat riwayat backup, restore point terbaru, dan konfigurasi bot backup...",
        loadErrorFallback: "Gagal memuat backup database",
        storageHint:
          "Backup disimpan di server pada folder database-backups. Restore selalu membuat safety backup baru terlebih dahulu sebelum mengganti data live.",
      },
      overview: {
        latestBackupDay: "Hari Backup Terbaru",
        latestBackupTime: "Waktu Backup Terbaru",
        latestSafetyBackup: "Safety Backup Terbaru",
        totalBackups: "Total Backup",
        availableBackups: "File Tersedia",
        totalStorage: "Penyimpanan Terpakai",
        noBackupYet: "Belum ada backup",
        neverCreated: "Belum pernah dibuat",
      },
      list: {
        title: "Daftar Backup",
        description:
          "Gunakan backup yang tersimpan untuk diunduh, ditinjau, atau direstore. Safety backup yang dibuat saat restore juga disimpan di sini.",
        protectionHint: (count) =>
          `${count} backup terbaru dilindungi dan tidak bisa dihapus.`,
        filteredCount: (count, total) =>
          count === total ? `${total} backup` : `${count} dari ${total} backup`,
        empty: "Belum ada backup database yang tersedia.",
        noMatches: "Tidak ada backup yang cocok dengan filter saat ini.",
        createdAt: "Dibuat",
        createdBy: "Dibuat Oleh",
        databaseName: "Database",
        fileSize: "Ukuran Arsip",
        backupType: "Jenis Backup",
        status: "Status File",
        lastRestored: "Restore Terakhir",
        sourceBackup: "Safety backup untuk",
        note: "Catatan",
        noCreator: "Sistem",
        neverRestored: "Belum pernah direstore",
        missingFileHelp:
          "Data backup ada, tetapi file arsipnya hilang dari folder server.",
      },
      filters: {
        fromDate: "Tanggal Dari",
        toDate: "Tanggal Sampai",
        type: "Jenis Backup",
        allTypes: "Semua jenis",
        manualOnly: "Backup manual",
        safetyOnly: "Safety backup",
      },
      actions: {
        download: "Unduh",
        downloading: "Mengunduh...",
        sendTelegram: "Kirim Ke Telegram",
        sendingTelegram: "Mengirim...",
        delete: "Hapus",
        deleting: "Menghapus...",
        protected: "Dilindungi",
        restore: "Restore",
        requestCode: "Kirim Kode Telegram",
        sendingCode: "Mengirim Kode...",
        restoreNow: "Unduh Safety Backup & Restore",
        preparingRestore: "Menyiapkan...",
        configureBot: "Atur Bot",
        saveBot: "Simpan Pengaturan Bot",
        savingBot: "Menyimpan...",
        testBot: "Kirim Tes",
        testingBot: "Menguji...",
      },
      restore: {
        title: "Restore Backup Database",
        description:
          "Restore dilindungi dengan kode Telegram. Sebelum data live diganti, database saat ini akan dibackup dan diunduh sebagai arsip pengaman.",
        selectedBackup: "Backup Terpilih",
        verificationCode: "Kode Telegram",
        verificationCodePlaceholder: "Masukkan kode 4 digit",
        verificationHint:
          "Minta kode terlebih dahulu. Tombol restore akan membuat safety backup baru, mengunduhnya, lalu baru melanjutkan restore.",
        codeSentAt: "Kode dikirim",
        codeExpiresAt: "Kode kedaluwarsa",
        safetyBackupReady: "Safety backup siap",
        safetyBackupDownload: (slug) => `Mengunduh safety backup ${slug} sebelum restore...`,
        confirmRestore: (slug) =>
          `Restore backup ${slug}? Database saat ini akan dibackup dulu, diunduh, lalu diganti.`,
        success: (selectedSlug, safetySlug) =>
          `Database berhasil direstore dari ${selectedSlug}. Safety backup ${safetySlug} dibuat terlebih dahulu.`,
        stepPreparing: "Membuat safety backup...",
        stepRestoring: "Merestore database...",
        latestProtection:
          "Database saat ini selalu diamankan otomatis sebelum setiap percobaan restore.",
      },
      telegram: {
        title: "Bot Verifikasi Restore",
        description:
          "Hanya admin. Atur bot Telegram yang digunakan untuk mengirim kode verifikasi restore sebelum restore database dimulai.",
        enabled: "Aktifkan verifikasi restore Telegram",
        enabledHelp:
          "Saat aktif, permintaan restore harus menerima kode 4 digit melalui bot ini sebelum restore dapat dilanjutkan, dan arsip backup yang selesai juga dibagikan ke chat yang diatur di latar belakang.",
        botToken: "Token Bot",
        botTokenPlaceholder: "123456:ABCDEF...",
        keepExistingToken: "Biarkan kosong untuk tetap memakai token yang tersimpan",
        clearSavedToken: "Hapus token bot yang tersimpan",
        chatIds: "Chat ID",
        chatIdsPlaceholder: "-1001234567890\n123456789",
        chatIdsHelp:
          "Masukkan satu chat ID per baris atau pisahkan beberapa ID dengan koma.",
        statusEnabled: "Verifikasi aktif",
        statusDisabled: "Verifikasi nonaktif",
        tokenStored: "Token tersimpan",
        tokenMissing: "Token belum ada",
        chatCount: "Tujuan chat",
        lastSentAt: "Pengiriman Telegram terakhir",
        lastError: "Error terakhir",
        noErrors: "Tidak ada error pengiriman terbaru",
        updateSuccess: "Pengaturan Telegram backup database berhasil disimpan.",
        testSuccess: "Pesan tes Telegram backup database berhasil dikirim.",
        loadErrorFallback: "Gagal memuat pengaturan bot restore Telegram",
        saveErrorFallback: "Gagal menyimpan pengaturan bot restore Telegram",
        testErrorFallback: "Gagal mengirim pesan tes bot restore Telegram",
      },
      statuses: {
        manual: "Backup Manual",
        preRestore: "Safety Backup",
        available: "Tersedia",
        missing: "Hilang",
      },
      messages: {
        exportSuccess: (slug) => `Backup database penuh ${slug} berhasil dibuat dan unduhan dimulai.`,
        exportCreatedDownloadFailed: (slug) =>
          `Backup ${slug} berhasil dibuat, tetapi unduhan otomatis gagal dimulai.`,
        downloadStarted: (slug) => `Unduhan dimulai untuk backup ${slug}.`,
        sendTelegramSuccess: (slug, sentCount, failedCount) =>
          failedCount
            ? `Backup ${slug} dikirim ke ${sentCount} chat Telegram. ${failedCount} percobaan pengiriman gagal.`
            : `Backup ${slug} berhasil dikirim ke ${sentCount} chat Telegram.`,
        deleteSuccess: (slug) => `Backup ${slug} berhasil dihapus.`,
        restoreCodeSent: "Kode restore Telegram berhasil dikirim.",
        noBackupSelected: "Pilih backup terlebih dahulu.",
        verificationCodeRequired: "Masukkan kode verifikasi Telegram 4 digit.",
        restoreCancelled: "Restore dibatalkan.",
      },
      confirmations: {
        delete: (slug, count) =>
          `Hapus backup ${slug}? ${count} backup terbaru akan tetap dilindungi.`,
      },
      misc: {
        yes: "Ya",
        no: "Tidak",
      },
    },
  },
};
