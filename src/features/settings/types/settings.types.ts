/** Admin-editable storefront settings (singleton `platform_settings` row). */
export interface PlatformSettings {
  supportEmail: string;
  supportPhone: string | null;
  updatedAt: string;
}
