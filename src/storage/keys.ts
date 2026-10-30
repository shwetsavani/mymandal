export const KEYS = {
    members: "mandal_members",
    obligations: "mandal_monthly_obligations",
    payments: "mandal_payments",
    waivers: "mandal_waivers",
    auditLog: "mandal_audit_log",
    settings: "mandal_settings",
    setup: "mandal_setup",
    schemaVersion: "mandal_schema_version",
    journal: "mandal_write_journal",
    premigrationSnapshot: "mandal_snapshot_premigration_v1",
    restoreSnapshots: "mandal_snapshots_prerestore",
    backupStatus: "mandal_backup_status",
    biometricEnabled: "mandal_biometric_enabled",
    loginSecurity: "mandal_login_security",
    lastBackgroundTime: "mandal_last_background_time",
    language: "mandal_app_language",
    reminderSettings: "mandal_reminder_settings",
    pendingRecoveryEmail: "mandal_pending_recovery_email",
    legacyCloudDeletions: "mandal_cloud_deleted_records",
} as const;

export const CURRENT_SCHEMA_VERSION = 2;
