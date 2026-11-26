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
      applied_ops: {
        Row: {
          applied_at: string
          op_id: string
        }
        Insert: {
          applied_at?: string
          op_id: string
        }
        Update: {
          applied_at?: string
          op_id?: string
        }
        Relationships: []
      }
      calendar_credentials: {
        Row: {
          connected_at: string
          group_id: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          connected_at?: string
          group_id: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          connected_at?: string
          group_id?: string
          refresh_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_credentials_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      diag_events: {
        Row: {
          created_at: string
          id: number
          kind: string | null
          message: string | null
          payload: Json | null
          phase: number | null
          stack: string | null
          ua: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          kind?: string | null
          message?: string | null
          payload?: Json | null
          phase?: number | null
          stack?: string | null
          ua?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string | null
          message?: string | null
          payload?: Json | null
          phase?: number | null
          stack?: string | null
          ua?: string | null
          url?: string | null
        }
        Relationships: []
      }
      game_rsvps: {
        Row: {
          email: string | null
          group_id: string
          name: string | null
          plan_iso: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          email?: string | null
          group_id: string
          name?: string | null
          plan_iso: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email?: string | null
          group_id?: string
          name?: string | null
          plan_iso?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rsvps_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_snapshots: {
        Row: {
          config: Json
          created_at: string
          data: Json
          group_id: string
          id: string
          live: Json | null
          name: string
          owner_id: string
          reason: string
          slug: string
        }
        Insert: {
          config?: Json
          created_at?: string
          data: Json
          group_id: string
          id?: string
          live?: Json | null
          name: string
          owner_id: string
          reason: string
          slug: string
        }
        Update: {
          config?: Json
          created_at?: string
          data?: Json
          group_id?: string
          id?: string
          live?: Json | null
          name?: string
          owner_id?: string
          reason?: string
          slug?: string
        }
        Relationships: []
      }
      group_views: {
        Row: {
          at: string
          email: string | null
          group_id: string
          id: number
          left_at: string | null
          name: string | null
          tabs: Json
          user_id: string | null
        }
        Insert: {
          at?: string
          email?: string | null
          group_id: string
          id?: number
          left_at?: string | null
          name?: string | null
          tabs?: Json
          user_id?: string | null
        }
        Update: {
          at?: string
          email?: string | null
          group_id?: string
          id?: number
          left_at?: string | null
          name?: string | null
          tabs?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_views_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          config: Json
          created_at: string
          data: Json
          id: string
          live: Json | null
          name: string
          owner_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          data?: Json
          id?: string
          live?: Json | null
          name?: string
          owner_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          data?: Json
          id?: string
          live?: Json | null
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ledger_deletions: {
        Row: {
          revision: number
          row_id: string
          table_name: string
        }
        Insert: {
          revision: number
          row_id: string
          table_name: string
        }
        Update: {
          revision?: number
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      ledger_state: {
        Row: {
          id: number
          last_replace_revision: number
          pin_hash: string
          revision: number
          updated_at: string
        }
        Insert: {
          id: number
          last_replace_revision?: number
          pin_hash?: string
          revision?: number
          updated_at?: string
        }
        Update: {
          id?: number
          last_replace_revision?: number
          pin_hash?: string
          revision?: number
          updated_at?: string
        }
        Relationships: []
      }
      of_secrets: {
        Row: {
          client_id: string
          client_secret: string
          id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_secret: string
          id: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pin_attempts: {
        Row: {
          count: number
          ip: string
          until: string
        }
        Insert: {
          count?: number
          ip: string
          until?: string
        }
        Update: {
          count?: number
          ip?: string
          until?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          email: string | null
          endpoint: string
          group_id: string
          id: number
          name: string | null
          p256dh: string
          player_name: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          email?: string | null
          endpoint: string
          group_id: string
          id?: number
          name?: string | null
          p256dh: string
          player_name?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          email?: string | null
          endpoint?: string
          group_id?: string
          id?: number
          name?: string | null
          p256dh?: string
          player_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          expires_at: string
          kind: string
          pin_hash: string | null
          token: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          kind: string
          pin_hash?: string | null
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          kind?: string
          pin_hash?: string | null
          token?: string
        }
        Relationships: []
      }
      t_budgets: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_cards: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_categories: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_goals: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_import_runs: {
        Row: {
          data: Json
          id: string
        }
        Insert: {
          data: Json
          id: string
        }
        Update: {
          data?: Json
          id?: string
        }
        Relationships: []
      }
      t_meta: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_monefy_archive: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_rules: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_transactions: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_group_with_snapshot: {
        Args: { p_group_id: string }
        Returns: string
      }
      filter_shared_group_data: {
        Args: { p_config: Json; p_data: Json }
        Returns: Json
      }
      list_group_snapshots: {
        Args: { p_group_id: string }
        Returns: {
          created_at: string
          id: string
          reason: string
        }[]
      }
      mark_group_payment: {
        Args: {
          p_by?: string
          p_field?: string
          p_fingerprint: string
          p_index: number
          p_paid: boolean
          p_session_id: string
          p_slug: string
        }
        Returns: Json
      }
      my_last_viewed_group: {
        Args: never
        Returns: {
          name: string
          slug: string
        }[]
      }
      project_payments_for_viewer: { Args: { p_payments: Json }; Returns: Json }
      project_session_for_viewer: { Args: { p_sess: Json }; Returns: Json }
      public_group: {
        Args: { p_slug: string }
        Returns: {
          data: Json
          id: string
          live: Json
          name: string
          updated_at: string
        }[]
      }
      public_group_v2: {
        Args: { p_slug: string }
        Returns: {
          config: Json
          data: Json
          id: string
          live: Json
          name: string
          updated_at: string
        }[]
      }
      restore_group_snapshot: {
        Args: { p_new_slug?: string; p_snapshot_id: string }
        Returns: {
          id: string
          slug: string
        }[]
      }
      snapshot_group: {
        Args: { p_group_id: string; p_reason: string }
        Returns: string
      }
      strip_buyin_event_sids: { Args: { p_rows: Json }; Returns: Json }
      vote_player_of_night: {
        Args: {
          p_candidate: string
          p_session_id: string
          p_slug: string
          p_voter: string
        }
        Returns: Json
      }
      write_group_cas: {
        Args: { p_expected_updated_at: string; p_id: string; p_patch: Json }
        Returns: string
      }
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
