// lib/alerts/types.ts

export type AlertSeverity = "info" | "success" | "warning" | "danger";

export type UserAlertAction = {
  label: string;
  href?: string; // internal navigation
};

export type UserAlert = {
  id: string;

  user_id: string;

  type: string;
  title: string;
  message: string;

  severity: AlertSeverity;

  action?: UserAlertAction | null;
  meta?: Record<string, any> | null;

  dedupe_key?: string | null;

  created_at: string;
  dismissed_at?: string | null;
};

export type CreateUserAlertInput = {
  type: string;
  title: string;
  message: string;

  severity?: AlertSeverity;

  action?: UserAlertAction | null;
  meta?: Record<string, any> | null;

  // If provided, duplicates won't be created.
  dedupe_key?: string | null;
};