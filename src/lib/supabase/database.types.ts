export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      cancellation_requests: {
        Row: {
          buyer_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          order_id: string
          reason: string
          seller_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["cancellation_request_status"]
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          order_id: string
          reason: string
          seller_id?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["cancellation_request_status"]
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          order_id?: string
          reason?: string
          seller_id?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["cancellation_request_status"]
          updated_at?: string
        }
        Relationships: []
      }
      addresses: {
        Row: {
          barangay: string | null
          city: string
          country: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          phone: string
          postal_code: string
          province: string | null
          recipient_name: string
          region: string | null
          street_details: string
          updated_at: string
          user_id: string
        }
        Insert: {
          barangay?: string | null
          city: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          phone: string
          postal_code: string
          province?: string | null
          recipient_name: string
          region?: string | null
          street_details: string
          updated_at?: string
          user_id: string
        }
        Update: {
          barangay?: string | null
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string
          postal_code?: string
          province?: string | null
          recipient_name?: string
          region?: string | null
          street_details?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_action_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_shop_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_shop_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_shop_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_action_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_action_log_target_shop_id_fkey"
            columns: ["target_shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_action_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_preferences: {
        Row: {
          created_at: string
          default_payment_method: string | null
          email_enabled: boolean
          order_updates: boolean
          promotions: boolean
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_payment_method?: string | null
          email_enabled?: boolean
          order_updates?: boolean
          promotions?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_payment_method?: string | null
          email_enabled?: boolean
          order_updates?: boolean
          promotions?: boolean
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          supports_occasion_matching: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          supports_occasion_matching?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          supports_occasion_matching?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_attributes: {
        Row: {
          allowed_values: string[] | null
          attribute_key: Database["public"]["Enums"]["product_attribute_key"]
          category_id: string
          created_at: string
          display_order: number
          id: string
          is_recommended: boolean
          is_required: boolean
          is_variant_eligible: boolean
          updated_at: string
        }
        Insert: {
          allowed_values?: string[] | null
          attribute_key: Database["public"]["Enums"]["product_attribute_key"]
          category_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_recommended?: boolean
          is_required?: boolean
          is_variant_eligible?: boolean
          updated_at?: string
        }
        Update: {
          allowed_values?: string[] | null
          attribute_key?: Database["public"]["Enums"]["product_attribute_key"]
          category_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_recommended?: boolean
          is_required?: boolean
          is_variant_eligible?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          low_stock_threshold: number
          product_id: string
          quantity: number
          shop_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          low_stock_threshold?: number
          product_id: string
          quantity?: number
          shop_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          low_stock_threshold?: number
          product_id?: string
          quantity?: number
          shop_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_idempotency_keys: {
        Row: {
          buyer_id: string
          created_at: string
          idempotency_key: string
          order_ids: string[]
          scope: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          idempotency_key: string
          order_ids?: string[]
          scope: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          idempotency_key?: string
          order_ids?: string[]
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_idempotency_keys_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_title: string
          quantity: number
          subtotal_cents: number
          unit_price_cents: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_title: string
          quantity: number
          subtotal_cents: number
          unit_price_cents: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_title?: string
          quantity?: number
          subtotal_cents?: number
          unit_price_cents?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "buyer_order_lifecycle"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipments: {
        Row: {
          courier: string | null
          created_at: string
          id: string
          order_id: string
          packed_at: string | null
          seller_id: string | null
          shop_id: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          courier?: string | null
          created_at?: string
          id?: string
          order_id: string
          packed_at?: string | null
          seller_id?: string | null
          shop_id?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          courier?: string | null
          created_at?: string
          id?: string
          order_id?: string
          packed_at?: string | null
          seller_id?: string | null
          shop_id?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "buyer_order_lifecycle"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_shipments_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_shipments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_confirmed_received_at: string | null
          buyer_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["user_role"] | null
          checkout_group_id: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_number: string
          order_status: Database["public"]["Enums"]["order_status"]
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          processing_at: string | null
          seller_id: string | null
          shipped_at: string | null
          shipping_address: Json
          shipping_fee_cents: number
          shop_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          buyer_confirmed_received_at?: string | null
          buyer_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["user_role"] | null
          checkout_group_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_number: string
          order_status?: Database["public"]["Enums"]["order_status"]
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["order_payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          placed_at?: string
          processing_at?: string | null
          seller_id?: string | null
          shipped_at?: string | null
          shipping_address: Json
          shipping_fee_cents?: number
          shop_id?: string | null
          subtotal_cents: number
          total_cents: number
          updated_at?: string
        }
        Update: {
          buyer_confirmed_received_at?: string | null
          buyer_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["user_role"] | null
          checkout_group_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          order_status?: Database["public"]["Enums"]["order_status"]
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["order_payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          placed_at?: string
          processing_at?: string | null
          seller_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json
          shipping_fee_cents?: number
          shop_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          event_type: string | null
          id: string
          payment_row_id: string | null
          processing_result: string
          raw_payload: Json
          received_at: string
          reference_id: string | null
          status: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        Insert: {
          event_type?: string | null
          id?: string
          payment_row_id?: string | null
          processing_result: string
          raw_payload: Json
          received_at?: string
          reference_id?: string | null
          status?: string | null
          xendit_payment_id?: string | null
          xendit_payment_request_id?: string | null
        }
        Update: {
          event_type?: string | null
          id?: string
          payment_row_id?: string | null
          processing_result?: string
          raw_payload?: Json
          received_at?: string
          reference_id?: string | null
          status?: string | null
          xendit_payment_id?: string | null
          xendit_payment_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_payment_row_id_fkey"
            columns: ["payment_row_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          checkout_group_id: string | null
          checkout_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_channel: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider_response: Json | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        Insert: {
          amount_cents: number
          checkout_group_id?: string | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          order_id: string
          payment_channel?: string | null
          payment_method_type?: Database["public"]["Enums"]["payment_method_type"]
          provider_response?: Json | null
          receipt_path?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          xendit_payment_id?: string | null
          xendit_payment_request_id?: string | null
        }
        Update: {
          amount_cents?: number
          checkout_group_id?: string | null
          checkout_url?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          order_id?: string
          payment_channel?: string | null
          payment_method_type?: Database["public"]["Enums"]["payment_method_type"]
          provider_response?: Json | null
          receipt_path?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          xendit_payment_id?: string | null
          xendit_payment_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "buyer_order_lifecycle"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          business_address: string | null
          business_hours: string | null
          id: boolean
          support_email: string
          support_phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_address?: string | null
          business_hours?: string | null
          id?: boolean
          support_email?: string
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_address?: string | null
          business_hours?: string | null
          id?: boolean
          support_email?: string
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          product_id: string
          sort_order: number
          url: string
          variant_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          url: string
          variant_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          url?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string | null
          created_at: string
          dimensions: string | null
          id: string
          material: string | null
          price_cents: number | null
          product_id: string
          seller_id: string | null
          shop_id: string | null
          size: string | null
          sku: string | null
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          dimensions?: string | null
          id?: string
          material?: string | null
          price_cents?: number | null
          product_id: string
          seller_id?: string | null
          shop_id?: string | null
          size?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          dimensions?: string | null
          id?: string
          material?: string | null
          price_cents?: number | null
          product_id?: string
          seller_id?: string | null
          shop_id?: string | null
          size?: string | null
          sku?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          condition: Database["public"]["Enums"]["product_condition"]
          created_at: string
          currency: string
          description: string | null
          dimensions: string | null
          featured: boolean
          id: string
          location: string | null
          material: string | null
          price_cents: number
          published_at: string | null
          quantity: number
          search_vector: unknown
          seller_id: string | null
          shop_id: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          tags: string[]
          title: string
          updated_at: string
          views_count: number
        }
        Insert: {
          category_id?: string | null
          condition?: Database["public"]["Enums"]["product_condition"]
          created_at?: string
          currency?: string
          description?: string | null
          dimensions?: string | null
          featured?: boolean
          id?: string
          location?: string | null
          material?: string | null
          price_cents: number
          published_at?: string | null
          quantity?: number
          search_vector?: unknown
          seller_id?: string | null
          shop_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          title: string
          updated_at?: string
          views_count?: number
        }
        Update: {
          category_id?: string | null
          condition?: Database["public"]["Enums"]["product_condition"]
          created_at?: string
          currency?: string
          description?: string | null
          dimensions?: string | null
          featured?: boolean
          id?: string
          location?: string | null
          material?: string | null
          price_cents?: number
          published_at?: string | null
          quantity?: number
          search_vector?: unknown
          seller_id?: string | null
          shop_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          payment_qr_url: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
          username_changed_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active?: boolean
          payment_qr_url?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
          username_changed_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          is_active?: boolean
          payment_qr_url?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
          username_changed_at?: string | null
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          hit_count: number
          key: string
          window_start: string
        }
        Insert: {
          hit_count?: number
          key: string
          window_start: string
        }
        Update: {
          hit_count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      recommendation_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          occasion:
            | Database["public"]["Enums"]["recommendation_occasion"]
            | null
          product_id: string
          seller_id: string
          shop_id: string | null
          size: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          occasion?:
            | Database["public"]["Enums"]["recommendation_occasion"]
            | null
          product_id: string
          seller_id: string
          shop_id?: string | null
          size?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          occasion?:
            | Database["public"]["Enums"]["recommendation_occasion"]
            | null
          product_id?: string
          seller_id?: string
          shop_id?: string | null
          size?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_rules_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_rules_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_rules_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision_note: string | null
          buyer_id: string
          condition_note: string | null
          cod_refund_method: string | null
          cod_refund_reference: string | null
          cod_refunded_at: string | null
          cod_refunded_by: string | null
          condition_recorded_by: string | null
          created_at: string
          evidence_path: string | null
          id: string
          marked_unsellable_at: string | null
          order_id: string
          order_item_id: string | null
          reason: string
          reason_code: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents: number | null
          replacement_courier: string | null
          replacement_shipped_at: string | null
          replacement_tracking_number: string | null
          request_type: Database["public"]["Enums"]["return_request_type"]
          restocked_at: string | null
          seller_decided_at: string | null
          seller_decided_by: string | null
          seller_decision_note: string | null
          seller_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
          return_courier: string | null
          return_deadline_at: string | null
          return_inspection: string | null
          return_received_at: string | null
          return_received_by: string | null
          return_shipped_at: string | null
          return_tracking_number: string | null
          replacement_completed_at: string | null
        }
        Insert: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision_note?: string | null
          buyer_id: string
          condition_note?: string | null
          cod_refund_method?: string | null
          cod_refund_reference?: string | null
          cod_refunded_at?: string | null
          cod_refunded_by?: string | null
          condition_recorded_by?: string | null
          created_at?: string
          evidence_path?: string | null
          id?: string
          marked_unsellable_at?: string | null
          order_id: string
          order_item_id?: string | null
          reason: string
          reason_code?: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents?: number | null
          replacement_courier?: string | null
          replacement_shipped_at?: string | null
          replacement_tracking_number?: string | null
          request_type?: Database["public"]["Enums"]["return_request_type"]
          restocked_at?: string | null
          seller_decided_at?: string | null
          seller_decided_by?: string | null
          seller_decision_note?: string | null
          seller_id?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
          return_courier?: string | null
          return_deadline_at?: string | null
          return_inspection?: string | null
          return_received_at?: string | null
          return_received_by?: string | null
          return_shipped_at?: string | null
          return_tracking_number?: string | null
          replacement_completed_at?: string | null
        }
        Update: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_decision_note?: string | null
          buyer_id?: string
          condition_note?: string | null
          cod_refund_method?: string | null
          cod_refund_reference?: string | null
          cod_refunded_at?: string | null
          cod_refunded_by?: string | null
          condition_recorded_by?: string | null
          created_at?: string
          evidence_path?: string | null
          id?: string
          marked_unsellable_at?: string | null
          order_id?: string
          order_item_id?: string | null
          reason?: string
          reason_code?: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents?: number | null
          replacement_courier?: string | null
          replacement_shipped_at?: string | null
          replacement_tracking_number?: string | null
          request_type?: Database["public"]["Enums"]["return_request_type"]
          restocked_at?: string | null
          seller_decided_at?: string | null
          seller_decided_by?: string | null
          seller_decision_note?: string | null
          seller_id?: string | null
          shop_id?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
          return_courier?: string | null
          return_deadline_at?: string | null
          return_inspection?: string | null
          return_received_at?: string | null
          return_received_by?: string | null
          return_shipped_at?: string | null
          return_tracking_number?: string | null
          replacement_completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_admin_decided_by_fkey"
            columns: ["admin_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_condition_recorded_by_fkey"
            columns: ["condition_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "buyer_order_lifecycle"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_seller_decided_by_fkey"
            columns: ["seller_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          order_item_id: string
          product_id: string
          rating: number
          reviewer_display_name: string | null
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string
          id?: string
          order_item_id: string
          product_id: string
          rating: number
          reviewer_display_name?: string | null
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_item_id?: string
          product_id?: string
          rating?: number
          reviewer_display_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_users: {
        Row: {
          created_at: string
          id: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_users_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          active: boolean
          banner_url: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          new_quantity: number
          note: string | null
          previous_quantity: number
          product_id: string
          reason: Database["public"]["Enums"]["stock_adjustment_reason"]
          related_order_id: string | null
          shop_id: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          new_quantity: number
          note?: string | null
          previous_quantity: number
          product_id: string
          reason: Database["public"]["Enums"]["stock_adjustment_reason"]
          related_order_id?: string | null
          shop_id?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          new_quantity?: number
          note?: string | null
          previous_quantity?: number
          product_id?: string
          reason?: Database["public"]["Enums"]["stock_adjustment_reason"]
          related_order_id?: string | null
          shop_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "buyer_order_lifecycle"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "stock_adjustments_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xendit_card_session_failures: {
        Row: {
          checkout_group_id: string | null
          created_at: string
          error_message: string
          id: string
          order_id: string
          payment_id: string
        }
        Insert: {
          checkout_group_id?: string | null
          created_at?: string
          error_message: string
          id?: string
          order_id: string
          payment_id: string
        }
        Update: {
          checkout_group_id?: string | null
          created_at?: string
          error_message?: string
          id?: string
          order_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xendit_card_session_failures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "buyer_order_lifecycle"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "xendit_card_session_failures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xendit_card_session_failures_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      xendit_refunds: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failure_code: string | null
          id: string
          payment_id: string
          raw_response: Json | null
          return_request_id: string
          status: Database["public"]["Enums"]["xendit_refund_status"]
          updated_at: string
          xendit_payment_request_id: string
          xendit_refund_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          failure_code?: string | null
          id?: string
          payment_id: string
          raw_response?: Json | null
          return_request_id: string
          status?: Database["public"]["Enums"]["xendit_refund_status"]
          updated_at?: string
          xendit_payment_request_id: string
          xendit_refund_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failure_code?: string | null
          id?: string
          payment_id?: string
          raw_response?: Json | null
          return_request_id?: string
          status?: Database["public"]["Enums"]["xendit_refund_status"]
          updated_at?: string
          xendit_payment_request_id?: string
          xendit_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xendit_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xendit_refunds_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      buyer_order_lifecycle: {
        Row: {
          active_payment_channel: string | null
          buyer_id: string | null
          lifecycle_tab: string | null
          order_id: string | null
          placed_at: string | null
        }
        Insert: {
          active_payment_channel?: never
          buyer_id?: string | null
          lifecycle_tab?: never
          order_id?: string | null
          placed_at?: string | null
        }
        Update: {
          active_payment_channel?: never
          buyer_id?: string | null
          lifecycle_tab?: never
          order_id?: string | null
          placed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_cart_item: {
        Args: { p_product_id: string; p_quantity: number; p_variant_id: string | null }
        Returns: {
          line_id: string
          stock_available: number
          total_quantity: number
        }[]
      }
      allocate_stock_to_variants: {
        Args: {
          p_allocations: Json
          p_product_id: string
        }
        Returns: number
      }
      adjust_stock: {
        Args: {
          p_delta: number
          p_note?: string
          p_product_id: string
          p_reason: Database["public"]["Enums"]["stock_adjustment_reason"]
          p_variant_id?: string
        }
        Returns: {
          created_at: string
          id: string
          low_stock_threshold: number
          product_id: string
          quantity: number
          shop_id: string | null
          updated_at: string
          variant_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "inventory"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_assign_seller_shop: {
        Args: { p_shop_id: string; p_user_id: string }
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          payment_qr_url: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
          username_changed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_demote_seller_to_buyer: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          payment_qr_url: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
          username_changed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_hard_delete_seller_account: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: Json
      }
      admin_hard_delete_shop: {
        Args: { p_reason?: string; p_shop_id: string }
        Returns: Json
      }
      admin_list_users: {
        Args: { p_user_id?: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
          shop_id: string
          shop_name: string
          username: string
        }[]
      }
      admin_set_user_active: {
        Args: { p_is_active: boolean; p_user_id: string }
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          payment_qr_url: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
          username_changed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_transfer_product_shop: {
        Args: { p_product_id: string; p_shop_id: string }
        Returns: {
          category_id: string | null
          condition: Database["public"]["Enums"]["product_condition"]
          created_at: string
          currency: string
          description: string | null
          dimensions: string | null
          featured: boolean
          id: string
          location: string | null
          material: string | null
          price_cents: number
          published_at: string | null
          quantity: number
          search_vector: unknown
          seller_id: string | null
          shop_id: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          tags: string[]
          title: string
          updated_at: string
          views_count: number
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_platform_settings: {
        Args: {
          p_business_address: string
          p_business_hours: string
          p_support_email: string
          p_support_phone: string
        }
        Returns: {
          business_address: string | null
          business_hours: string | null
          id: boolean
          support_email: string
          support_phone: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "platform_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_shop: {
        Args: { p_active?: boolean; p_name?: string; p_shop_id: string }
        Returns: {
          active: boolean
          banner_url: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "shops"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_xendit_group_payment_attempt: {
        Args: { p_channel_code: string; p_checkout_group_id: string }
        Returns: {
          amount_cents: number
          checkout_group_id: string | null
          checkout_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_channel: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider_response: Json | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_xendit_payment_attempt: {
        Args: { p_channel_code: string; p_order_id: string }
        Returns: {
          amount_cents: number
          checkout_group_id: string | null
          checkout_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_channel: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider_response: Json | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_rate_limit: {
        Args: { p_key: string; p_max_hits: number; p_window_seconds: number }
        Returns: boolean
      }
      confirm_order_received: {
        Args: { p_order_id: string }
        Returns: {
          buyer_confirmed_received_at: string | null
          buyer_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["user_role"] | null
          checkout_group_id: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_number: string
          order_status: Database["public"]["Enums"]["order_status"]
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          processing_at: string | null
          seller_id: string | null
          shipped_at: string | null
          shipping_address: Json
          shipping_fee_cents: number
          shop_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: {
          p_checkout_group_id?: string
          p_idempotency_key?: string
          p_items: Json
          p_notes?: string
          p_payment_method?: string
          p_seller_id: string
          p_shipping_address: Json
          p_shipping_fee_cents?: number
        }
        Returns: {
          buyer_confirmed_received_at: string | null
          buyer_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["user_role"] | null
          checkout_group_id: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_number: string
          order_status: Database["public"]["Enums"]["order_status"]
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          processing_at: string | null
          seller_id: string | null
          shipped_at: string | null
          shipping_address: Json
          shipping_fee_cents: number
          shop_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order_group: {
        Args: {
          p_groups: Json
          p_idempotency_key?: string
          p_notes?: string
          p_payment_method?: string
          p_shipping_address: Json
          p_shipping_fee_cents?: number
        }
        Returns: {
          buyer_confirmed_received_at: string | null
          buyer_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["user_role"] | null
          checkout_group_id: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_number: string
          order_status: Database["public"]["Enums"]["order_status"]
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          processing_at: string | null
          seller_id: string | null
          shipped_at: string | null
          shipping_address: Json
          shipping_fee_cents: number
          shop_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dashboard_payment_history_summary: {
        Args: {
          p_payment_method_type?: string
          p_payment_source?: string
          p_search?: string
          p_stale_only?: boolean
          p_status?: string
        }
        Returns: {
          failed_count: number
          paid_amount_cents: number
          paid_count: number
          payment_count: number
          pending_count: number
          refunded_count: number
        }[]
      }
      decide_return: {
        Args: {
          p_decision: string
          p_note?: string
          p_resolution_type?: Database["public"]["Enums"]["return_request_type"]
          p_return_id: string
        }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision_note: string | null
          buyer_id: string
          condition_note: string | null
          condition_recorded_by: string | null
          created_at: string
          evidence_path: string | null
          id: string
          marked_unsellable_at: string | null
          order_id: string
          order_item_id: string | null
          reason: string
          reason_code: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents: number | null
          replacement_courier: string | null
          replacement_shipped_at: string | null
          replacement_tracking_number: string | null
          request_type: Database["public"]["Enums"]["return_request_type"]
          restocked_at: string | null
          seller_decided_at: string | null
          seller_decided_by: string | null
          seller_decision_note: string | null
          seller_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_unpaid_xendit_order: {
        Args: { p_order_id: string }
        Returns: {
          buyer_confirmed_received_at: string | null
          buyer_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["user_role"] | null
          checkout_group_id: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_number: string
          order_status: Database["public"]["Enums"]["order_status"]
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["order_payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          processing_at: string | null
          seller_id: string | null
          shipped_at: string | null
          shipping_address: Json
          shipping_fee_cents: number
          shop_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_xendit_refund_submission: {
        Args: { p_error_note: string; p_refund_id: string }
        Returns: {
          amount_cents: number
          created_at: string
          currency: string
          failure_code: string | null
          id: string
          payment_id: string
          raw_response: Json | null
          return_request_id: string
          status: Database["public"]["Enums"]["xendit_refund_status"]
          updated_at: string
          xendit_payment_request_id: string
          xendit_refund_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "xendit_refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_xendit_group_payment_request: {
        Args: {
          p_channel_code: string
          p_checkout_group_id: string
          p_checkout_url: string
          p_expires_at?: string
          p_status?: string
          p_xendit_payment_request_id: string
        }
        Returns: {
          amount_cents: number
          checkout_group_id: string | null
          checkout_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_channel: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider_response: Json | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_xendit_payment_request: {
        Args: {
          p_checkout_url: string
          p_expires_at?: string
          p_payment_id: string
          p_status?: string
          p_xendit_payment_request_id: string
        }
        Returns: {
          amount_cents: number
          checkout_group_id: string | null
          checkout_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_channel: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider_response: Json | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_buyer_activity_feed: {
        Args: { p_limit?: number }
        Returns: {
          event_type: string
          occurred_at: string
          order_id: string
          order_number: string
        }[]
      }
      get_marketplace_stats: {
        Args: never
        Returns: {
          buyer_count: number
          fulfilled_order_count: number
          product_count: number
          seller_count: number
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          is_active: boolean
          payment_qr_url: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
          username_changed_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_product_sold_counts: {
        Args: { p_product_ids: string[] }
        Returns: {
          product_id: string
          units_sold: number
        }[]
      }
      get_variant_stock: {
        Args: { p_variant_ids: string[] }
        Returns: {
          quantity: number
          variant_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_shop_member: { Args: { p_shop_id: string }; Returns: boolean }
      log_unrecognized_xendit_webhook_payload: {
        Args: { p_event_type: string; p_raw_payload: Json }
        Returns: undefined
      }
      log_xendit_card_session_failure: {
        Args: { p_error_message: string; p_payment_id: string }
        Returns: undefined
      }
      mark_cod_payment_collected: {
        Args: { p_order_id: string }
        Returns: {
          amount_cents: number
          checkout_group_id: string | null
          checkout_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_channel: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider_response: Json | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_xendit_refund_webhook: {
        Args: {
          p_amount_cents: number
          p_failure_code: string
          p_raw_payload: Json
          p_status: string
          p_xendit_refund_id: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          currency: string
          failure_code: string | null
          id: string
          payment_id: string
          raw_response: Json | null
          return_request_id: string
          status: Database["public"]["Enums"]["xendit_refund_status"]
          updated_at: string
          xendit_payment_request_id: string
          xendit_refund_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "xendit_refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_xendit_webhook: {
        Args: {
          p_amount_cents: number
          p_channel_code?: string
          p_currency: string
          p_raw_payload: Json
          p_reference_id: string
          p_status: string
          p_xendit_payment_id: string
          p_xendit_payment_request_id: string
        }
        Returns: {
          amount_cents: number
          checkout_group_id: string | null
          checkout_url: string | null
          created_at: string
          currency: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          order_id: string
          payment_channel: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider_response: Json | null
          receipt_path: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          xendit_payment_id: string | null
          xendit_payment_request_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_order_shipment: {
        Args: {
          p_courier: string
          p_order_id: string
          p_tracking_number: string
        }
        Returns: {
          courier: string | null
          created_at: string
          id: string
          order_id: string
          packed_at: string | null
          seller_id: string | null
          shop_id: string | null
          tracking_number: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order_shipments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_return_item_condition: {
        Args: { p_condition: string; p_note?: string; p_return_id: string }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision_note: string | null
          buyer_id: string
          condition_note: string | null
          condition_recorded_by: string | null
          created_at: string
          evidence_path: string | null
          id: string
          marked_unsellable_at: string | null
          order_id: string
          order_item_id: string | null
          reason: string
          reason_code: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents: number | null
          replacement_courier: string | null
          replacement_shipped_at: string | null
          replacement_tracking_number: string | null
          request_type: Database["public"]["Enums"]["return_request_type"]
          restocked_at: string | null
          seller_decided_at: string | null
          seller_decided_by: string | null
          seller_decision_note: string | null
          seller_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_replacement_received: {
        Args: { p_return_id: string }
        Returns: Database["public"]["Tables"]["return_requests"]["Row"]
      }
      complete_overdue_replacements: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      record_return_shipment: {
        Args: {
          p_courier: string
          p_return_id: string
          p_tracking_number: string
        }
        Returns: Database["public"]["Tables"]["return_requests"]["Row"]
      }
      record_return_received: {
        Args: {
          p_condition: string
          p_note?: string
          p_return_id: string
        }
        Returns: Database["public"]["Tables"]["return_requests"]["Row"]
      }
      expire_overdue_return_requests: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cancel_order_with_refund: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Json
      }
      request_order_cancellation: {
        Args: { p_order_id: string; p_reason: string }
        Returns: Database["public"]["Tables"]["cancellation_requests"]["Row"]
      }
      respond_to_cancellation_request: {
        Args: { p_decision: string; p_note?: string; p_request_id: string }
        Returns: Json
      }
      retry_order_refund: {
        Args: { p_return_request_id: string }
        Returns: Json
      }
      system_retry_cancellation_refund: {
        Args: { p_max_attempts?: number; p_return_request_id: string }
        Returns: Json
      }
      system_record_xendit_refund_submission: {
        Args: {
          p_raw_response: Json
          p_refund_id: string
          p_xendit_refund_id: string
        }
        Returns: Database["public"]["Tables"]["xendit_refunds"]["Row"]
      }
      system_fail_xendit_refund_submission: {
        Args: { p_error_note: string; p_refund_id: string }
        Returns: Database["public"]["Tables"]["xendit_refunds"]["Row"]
      }
      refund_late_payment_on_cancelled_order: {
        Args: {
          p_amount_cents: number
          p_channel_code: string
          p_currency: string
          p_raw_payload: Json
          p_reference_id: string
          p_status: string
          p_xendit_payment_id: string
          p_xendit_payment_request_id: string
        }
        Returns: Json
      }
      report_refund_pipeline: {
        Args: { p_from: string; p_shop_id?: string; p_to: string }
        Returns: {
          attention_refund_cents: number
          attention_refunds: number
          pending_refund_cents: number
          pending_refunds: number
        }[]
      }
      record_cod_refund_payout: {
        Args: {
          p_method: string
          p_note?: string
          p_reference: string
          p_return_id: string
        }
        Returns: Database["public"]["Tables"]["return_requests"]["Row"]
      }
      record_return_replacement_shipment: {
        Args: {
          p_courier: string
          p_return_id: string
          p_tracking_number: string
        }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision_note: string | null
          buyer_id: string
          condition_note: string | null
          condition_recorded_by: string | null
          created_at: string
          evidence_path: string | null
          id: string
          marked_unsellable_at: string | null
          order_id: string
          order_item_id: string | null
          reason: string
          reason_code: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents: number | null
          replacement_courier: string | null
          replacement_shipped_at: string | null
          replacement_tracking_number: string | null
          request_type: Database["public"]["Enums"]["return_request_type"]
          restocked_at: string | null
          seller_decided_at: string | null
          seller_decided_by: string | null
          seller_decision_note: string | null
          seller_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_xendit_refund_submission: {
        Args: {
          p_raw_response: Json
          p_refund_id: string
          p_xendit_refund_id: string
        }
        Returns: {
          amount_cents: number
          created_at: string
          currency: string
          failure_code: string | null
          id: string
          payment_id: string
          raw_response: Json | null
          return_request_id: string
          status: Database["public"]["Enums"]["xendit_refund_status"]
          updated_at: string
          xendit_payment_request_id: string
          xendit_refund_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "xendit_refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_order_status_breakdown: {
        Args: { p_from: string; p_shop_id?: string; p_to: string }
        Returns: {
          order_count: number
          status: Database["public"]["Enums"]["order_status"]
        }[]
      }
      report_payment_source_summary: {
        Args: { p_from: string; p_shop_id?: string; p_to: string }
        Returns: {
          amount_cents: number
          order_count: number
          source_key: string
        }[]
      }
      report_revenue_by_category: {
        Args: { p_from: string; p_shop_id?: string; p_to: string }
        Returns: {
          category_id: string
          category_name: string
          revenue_cents: number
          units_sold: number
        }[]
      }
      report_sales_summary: {
        Args: { p_from: string; p_shop_id?: string; p_to: string }
        Returns: {
          avg_order_value_cents: number
          cancelled_orders: number
          cod_paid_orders: number
          gross_revenue_cents: number
          paid_orders: number
          pending_payment_orders: number
          qr_paid_orders: number
          refunded_orders: number
          refunds_cents: number
          revenue_cents: number
          total_orders: number
          units_sold: number
          xendit_paid_orders: number
        }[]
      }
      report_sales_timeseries: {
        Args: {
          p_from: string
          p_granularity?: string
          p_shop_id?: string
          p_to: string
        }
        Returns: {
          bucket: string
          order_count: number
          revenue_cents: number
        }[]
      }
      report_top_products: {
        Args: {
          p_from: string
          p_limit?: number
          p_shop_id?: string
          p_to: string
        }
        Returns: {
          product_id: string
          product_title: string
          revenue_cents: number
          units_sold: number
        }[]
      }
      request_return: {
        Args: {
          p_evidence_path?: string
          p_explanation?: string
          p_order_id: string
          p_order_item_id?: string
          p_reason?: string
          p_reason_code?: Database["public"]["Enums"]["return_reason_code"]
          p_request_type?: Database["public"]["Enums"]["return_request_type"]
        }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision_note: string | null
          buyer_id: string
          condition_note: string | null
          condition_recorded_by: string | null
          created_at: string
          evidence_path: string | null
          id: string
          marked_unsellable_at: string | null
          order_id: string
          order_item_id: string | null
          reason: string
          reason_code: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents: number | null
          replacement_courier: string | null
          replacement_shipped_at: string | null
          replacement_tracking_number: string | null
          request_type: Database["public"]["Enums"]["return_request_type"]
          restocked_at: string | null
          seller_decided_at: string | null
          seller_decided_by: string | null
          seller_decision_note: string | null
          seller_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_shop_membership: {
        Args: { p_seller_ids?: string[]; p_shop_ids?: string[] }
        Returns: {
          seller_id: string
          shop_id: string
          shop_name: string
        }[]
      }
      respond_to_return: {
        Args: { p_decision: string; p_note?: string; p_return_id: string }
        Returns: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_decision_note: string | null
          buyer_id: string
          condition_note: string | null
          condition_recorded_by: string | null
          created_at: string
          evidence_path: string | null
          id: string
          marked_unsellable_at: string | null
          order_id: string
          order_item_id: string | null
          reason: string
          reason_code: Database["public"]["Enums"]["return_reason_code"]
          refund_amount_cents: number | null
          replacement_courier: string | null
          replacement_shipped_at: string | null
          replacement_tracking_number: string | null
          request_type: Database["public"]["Enums"]["return_request_type"]
          restocked_at: string | null
          seller_decided_at: string | null
          seller_decided_by: string | null
          seller_decision_note: string | null
          seller_id: string | null
          shop_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      self_deactivate_account: { Args: never; Returns: undefined }
      slugify: { Args: { value: string }; Returns: string }
      submit_review: {
        Args: { p_comment: string; p_order_item_id: string; p_rating: number }
        Returns: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          order_item_id: string
          product_id: string
          rating: number
          reviewer_display_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unaccent_fallback: { Args: { value: string }; Returns: string }
    }
    Enums: {
      cancellation_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "expired"
      gender_type: "male" | "female" | "other"
      order_payment_method: "cod" | "xendit"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      payment_method_type: "cod" | "card" | "qr_upload" | "xendit"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
      product_attribute_key: "color" | "size" | "material" | "dimensions"
      product_condition: "new" | "like_new" | "good" | "fair" | "poor"
      product_status: "draft" | "active" | "sold" | "archived"
      recommendation_occasion:
        | "casual"
        | "formal"
        | "work"
        | "sportswear"
        | "party"
        | "wedding"
        | "everyday"
      return_reason_code:
        | "damaged_item"
        | "defective_item"
        | "wrong_item"
        | "missing_item"
        | "item_not_received"
        | "other"
        | "order_cancelled"
      return_request_type:
        | "money_refund"
        | "return_and_refund"
        | "replacement_exchange"
      return_status:
        | "pending"
        | "seller_accepted"
        | "seller_rejected"
        | "admin_rejected"
        | "refunded"
        | "replacement_approved"
        | "refund_due"
        | "awaiting_return"
        | "return_shipped"
        | "return_received"
        | "return_expired"
        | "replacement_shipped"
        | "replacement_completed"
      stock_adjustment_reason:
        | "initial_stock"
        | "restock"
        | "correction"
        | "sale"
        | "cancellation_restock"
        | "shrinkage"
        | "other"
        | "return_restock"
        | "replacement_shipment"
      user_role: "buyer" | "seller" | "admin"
      xendit_refund_status: "pending" | "succeeded" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cancellation_request_status: [
        "pending",
        "approved",
        "rejected",
        "expired",
      ],
      gender_type: ["male", "female", "other"],
      order_payment_method: ["cod", "xendit"],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      payment_method_type: ["cod", "card", "qr_upload", "xendit"],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      product_attribute_key: ["color", "size", "material", "dimensions"],
      product_condition: ["new", "like_new", "good", "fair", "poor"],
      product_status: ["draft", "active", "sold", "archived"],
      recommendation_occasion: [
        "casual",
        "formal",
        "work",
        "sportswear",
        "party",
        "wedding",
        "everyday",
      ],
      return_reason_code: [
        "damaged_item",
        "defective_item",
        "wrong_item",
        "missing_item",
        "item_not_received",
        "other",
        "order_cancelled",
      ],
      return_request_type: [
        "money_refund",
        "return_and_refund",
        "replacement_exchange",
      ],
      return_status: [
        "pending",
        "seller_accepted",
        "seller_rejected",
        "admin_rejected",
        "refunded",
        "replacement_approved",
        "refund_due",
        "awaiting_return",
        "return_shipped",
        "return_received",
        "return_expired",
        "replacement_shipped",
        "replacement_completed",
      ],
      stock_adjustment_reason: [
        "initial_stock",
        "restock",
        "correction",
        "sale",
        "cancellation_restock",
        "shrinkage",
        "other",
        "return_restock",
        "replacement_shipment",
      ],
      user_role: ["buyer", "seller", "admin"],
      xendit_refund_status: ["pending", "succeeded", "failed"],
    },
  },
} as const
