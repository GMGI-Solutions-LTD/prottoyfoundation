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
      admin_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          file_name: string | null
          id: string
          import_batch_id: string | null
          records_processed: number
          status: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          file_name?: string | null
          id?: string
          import_batch_id?: string | null
          records_processed?: number
          status?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          file_name?: string | null
          id?: string
          import_batch_id?: string | null
          records_processed?: number
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      blood_donors: {
        Row: {
          blood_group: Database["public"]["Enums"]["blood_group"]
          created_at: string
          id: string
          is_active: boolean
          last_donation_date: string | null
          mobile: string | null
          name: string
          notes: string | null
          permanent_address: string | null
          present_address: string | null
          reference_mobile: string | null
          reference_person: string | null
          sl: number
          updated_at: string
        }
        Insert: {
          blood_group: Database["public"]["Enums"]["blood_group"]
          created_at?: string
          id?: string
          is_active?: boolean
          last_donation_date?: string | null
          mobile?: string | null
          name: string
          notes?: string | null
          permanent_address?: string | null
          present_address?: string | null
          reference_mobile?: string | null
          reference_person?: string | null
          sl: number
          updated_at?: string
        }
        Update: {
          blood_group?: Database["public"]["Enums"]["blood_group"]
          created_at?: string
          id?: string
          is_active?: boolean
          last_donation_date?: string | null
          mobile?: string | null
          name?: string
          notes?: string | null
          permanent_address?: string | null
          present_address?: string | null
          reference_mobile?: string | null
          reference_person?: string | null
          sl?: number
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          fund_id: string
          id: string
          payee: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          fund_id: string
          id?: string
          payee?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          fund_id?: string
          id?: string
          payee?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_one_time: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_one_time?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_one_time?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      member_fund_subscriptions: {
        Row: {
          created_at: string
          end_date: string | null
          fund_id: string
          id: string
          is_active: boolean
          member_id: string
          monthly_amount: number
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          fund_id: string
          id?: string
          is_active?: boolean
          member_id: string
          monthly_amount?: number
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          fund_id?: string
          id?: string
          is_active?: boolean
          member_id?: string
          monthly_amount?: number
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_fund_subscriptions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_fund_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_member_types: {
        Row: {
          created_at: string
          member_id: string
          member_type_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          member_type_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          member_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_member_types_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_member_types_member_type_id_fkey"
            columns: ["member_type_id"]
            isOneToOne: false
            referencedRelation: "member_types"
            referencedColumns: ["id"]
          },
        ]
      }
      member_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          joining_date: string
          member_no: number
          member_type: Database["public"]["Enums"]["member_type"] | null
          member_type_id: string | null
          mobile: string | null
          monthly_fee: number
          notes: string | null
          reference_person: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          joining_date?: string
          member_no?: number
          member_type?: Database["public"]["Enums"]["member_type"] | null
          member_type_id?: string | null
          mobile?: string | null
          monthly_fee?: number
          notes?: string | null
          reference_person?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          joining_date?: string
          member_no?: number
          member_type?: Database["public"]["Enums"]["member_type"] | null
          member_type_id?: string | null
          mobile?: string | null
          monthly_fee?: number
          notes?: string | null
          reference_person?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_member_type_id_fkey"
            columns: ["member_type_id"]
            isOneToOne: false
            referencedRelation: "member_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          id: string
          issued_at: string
          issued_by: string | null
          issued_to: string
          receipt_no: string
          serial: number
          transaction_id: string
        }
        Insert: {
          amount: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_to: string
          receipt_no: string
          serial?: number
          transaction_id: string
        }
        Update: {
          amount?: number
          id?: string
          issued_at?: string
          issued_by?: string | null
          issued_to?: string
          receipt_no?: string
          serial?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_audit_logs: {
        Row: {
          action: string
          created_at: string
          for_month: string | null
          fund_id: string | null
          fund_type: string | null
          id: string
          import_batch_id: string | null
          member_id: string | null
          new_amount: number | null
          new_data: Json | null
          previous_amount: number | null
          previous_data: Json | null
          source_file: string | null
          transaction_id: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          action?: string
          created_at?: string
          for_month?: string | null
          fund_id?: string | null
          fund_type?: string | null
          id?: string
          import_batch_id?: string | null
          member_id?: string | null
          new_amount?: number | null
          new_data?: Json | null
          previous_amount?: number | null
          previous_data?: Json | null
          source_file?: string | null
          transaction_id?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          for_month?: string | null
          fund_id?: string | null
          fund_type?: string | null
          id?: string
          import_batch_id?: string | null
          member_id?: string | null
          new_amount?: number | null
          new_data?: Json | null
          previous_amount?: number | null
          previous_data?: Json | null
          source_file?: string | null
          transaction_id?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_audit_logs_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_audit_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          attachment_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          donor_name: string | null
          for_month: string | null
          fund_id: string
          id: string
          member_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          txn_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          donor_name?: string | null
          for_month?: string | null
          fund_id: string
          id?: string
          member_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          txn_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          donor_name?: string | null
          for_month?: string | null
          fund_id?: string
          id?: string
          member_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          txn_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_needed: { Args: never; Returns: boolean }
      import_reg_and_monthly: {
        Args: { p_batch_id?: string; p_file_name?: string; p_rows: Json }
        Returns: Json
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "super_admin"
      blood_group: "A+" | "A-" | "B+" | "B-" | "O+" | "O-" | "AB+" | "AB-"
      member_type: "founding" | "executive" | "general"
      payment_method: "cash" | "bkash" | "nagad" | "rocket" | "bank" | "other"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "super_admin"],
      blood_group: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
      member_type: ["founding", "executive", "general"],
      payment_method: ["cash", "bkash", "nagad", "rocket", "bank", "other"],
    },
  },
} as const
