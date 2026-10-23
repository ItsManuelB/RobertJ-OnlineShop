/** Admin-editable storefront settings (singleton `platform_settings` row). */
export interface PlatformSettings {
  supportEmail: string;
  supportPhone: string | null;
  businessAddress: string | null;
  businessHours: string | null;
  defaultLowStockThreshold: number;
  updatedAt: string;
}
