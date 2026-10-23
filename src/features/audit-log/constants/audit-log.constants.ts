/**
 * Every action any RPC currently opts into logging to `admin_action_log`
 * (see that table's own comment: append-only, admin-read-only). Single
 * source for the audit-log filter chips and the table's label/tone lookup
 * — previously duplicated as two inline `Record`s in `AuditLogTable.tsx`.
 * `demote_seller_to_buyer` (M3) is included here even though its own
 * migration predates this file, since this is simply where every logged
 * action's display metadata lives.
 */
export const AUDIT_LOG_ACTIONS = [
  "assign_seller_shop",
  "demote_seller_to_buyer",
  "deactivate_user",
  "reactivate_user",
  "approve_refund",
  "reject_refund",
  "update_platform_settings",
  "update_inventory_threshold",
] as const;

export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export const AUDIT_LOG_ACTION_LABELS: Record<AuditLogAction, string> = {
  assign_seller_shop: "Assigned seller to shop",
  demote_seller_to_buyer: "Demoted seller to buyer",
  deactivate_user: "Deactivated account",
  reactivate_user: "Reactivated account",
  approve_refund: "Approved refund",
  reject_refund: "Rejected return request",
  update_platform_settings: "Updated platform settings",
  update_inventory_threshold: "Updated inventory threshold",
};

export const AUDIT_LOG_ACTION_TONE: Record<
  AuditLogAction,
  "neutral" | "info" | "success" | "danger"
> = {
  assign_seller_shop: "info",
  demote_seller_to_buyer: "danger",
  deactivate_user: "danger",
  reactivate_user: "success",
  approve_refund: "success",
  reject_refund: "danger",
  update_platform_settings: "info",
  update_inventory_threshold: "info",
};

/** Type guard for the `action` search param — an unrecognized value is treated as "All". */
export function isAuditLogAction(value: string | null | undefined): value is AuditLogAction {
  return (AUDIT_LOG_ACTIONS as readonly string[]).includes(value ?? "");
}
