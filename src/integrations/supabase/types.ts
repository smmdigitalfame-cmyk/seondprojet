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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_keys: {
        Row: {
          active: boolean
          created_at: string
          device_fingerprints: string[] | null
          expires_at: string | null
          id: string
          key: string
          label: string | null
          last_seen_at: string | null
          legacy: boolean
          legacy_checked_at: string | null
          max_devices: number
          razorpay_payment_id: string | null
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          device_fingerprints?: string[] | null
          expires_at?: string | null
          id?: string
          key: string
          label?: string | null
          last_seen_at?: string | null
          legacy?: boolean
          legacy_checked_at?: string | null
          max_devices?: number
          razorpay_payment_id?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          device_fingerprints?: string[] | null
          expires_at?: string | null
          id?: string
          key?: string
          label?: string | null
          last_seen_at?: string | null
          legacy?: boolean
          legacy_checked_at?: string | null
          max_devices?: number
          razorpay_payment_id?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          access_key: string | null
          admin_chat_ids: string[]
          created_at: string
          gmail: string | null
          id: string
          message_preview: string | null
          missing_fields: string[]
          payment_id: string
          phone: string | null
          plan_label: string | null
          rupees: number | null
          telegram_sent: boolean
          verified: boolean
        }
        Insert: {
          access_key?: string | null
          admin_chat_ids?: string[]
          created_at?: string
          gmail?: string | null
          id?: string
          message_preview?: string | null
          missing_fields?: string[]
          payment_id: string
          phone?: string | null
          plan_label?: string | null
          rupees?: number | null
          telegram_sent?: boolean
          verified?: boolean
        }
        Update: {
          access_key?: string | null
          admin_chat_ids?: string[]
          created_at?: string
          gmail?: string | null
          id?: string
          message_preview?: string | null
          missing_fields?: string[]
          payment_id?: string
          phone?: string | null
          plan_label?: string | null
          rupees?: number | null
          telegram_sent?: boolean
          verified?: boolean
        }
        Relationships: []
      }
      api_settings: {
        Row: {
          alerted_urgent: boolean
          alerted_warning: boolean
          current_key: string | null
          id: number
          monthly_limit: number
          period_start: string
          updated_at: string
          used_count: number
        }
        Insert: {
          alerted_urgent?: boolean
          alerted_warning?: boolean
          current_key?: string | null
          id?: number
          monthly_limit?: number
          period_start?: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          alerted_urgent?: boolean
          alerted_warning?: boolean
          current_key?: string | null
          id?: number
          monthly_limit?: number
          period_start?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      ig_scrape_cache: {
        Row: {
          cache_key: string
          payload: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          payload: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      payment_user_links: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string
          id: string
          phone: string | null
          source: string
          telegram_chat_id: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          phone?: string | null
          source?: string
          telegram_chat_id?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          phone?: string | null
          source?: string
          telegram_chat_id?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      reels_data: {
        Row: {
          account: string
          created_at: string
          data: Json
          id: string
          post_index: number
          updated_at: string
        }
        Insert: {
          account: string
          created_at?: string
          data?: Json
          id?: string
          post_index: number
          updated_at?: string
        }
        Update: {
          account?: string
          created_at?: string
          data?: Json
          id?: string
          post_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          cache_key: string
          expires_at: string
          hits: number
          pages: number
          payload: Json
          stored_at: string
          type: string
          username: string
        }
        Insert: {
          cache_key: string
          expires_at: string
          hits?: number
          pages?: number
          payload: Json
          stored_at?: string
          type: string
          username: string
        }
        Update: {
          cache_key?: string
          expires_at?: string
          hits?: number
          pages?: number
          payload?: Json
          stored_at?: string
          type?: string
          username?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          amount_paise: number | null
          created_at: string
          error: string | null
          expires_at: string | null
          generated_key: string | null
          id: string
          payment_id: string | null
          plan_label: string | null
          raw: Json | null
          rupees: number | null
          status: string
          telegram_chat_id: string | null
          telegram_sent: boolean
        }
        Insert: {
          amount_paise?: number | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          generated_key?: string | null
          id?: string
          payment_id?: string | null
          plan_label?: string | null
          raw?: Json | null
          rupees?: number | null
          status: string
          telegram_chat_id?: string | null
          telegram_sent?: boolean
        }
        Update: {
          amount_paise?: number | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          generated_key?: string | null
          id?: string
          payment_id?: string | null
          plan_label?: string | null
          raw?: Json | null
          rupees?: number | null
          status?: string
          telegram_chat_id?: string | null
          telegram_sent?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deactivate_expired_access_keys: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
