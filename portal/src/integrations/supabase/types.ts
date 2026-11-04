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
      activity_log: {
        Row: {
          actor: string
          client_id: string | null
          created_at: string
          id: string
          message: string
        }
        Insert: {
          actor?: string
          client_id?: string | null
          created_at?: string
          id?: string
          message: string
        }
        Update: {
          actor?: string
          client_id?: string | null
          created_at?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          access_method: string
          away_kit: Json
          company: string | null
          created_at: string
          email: string | null
          home_kit: Json
          id: string
          monthly_fee: number | null
          name: string
          notes: string | null
          phone: string | null
          portal_email: string | null
          portal_enabled: boolean
          portal_token: string
          portal_type: string
          status: string
          updated_at: string
        }
        Insert: {
          access_method?: string
          away_kit?: Json
          company?: string | null
          created_at?: string
          email?: string | null
          home_kit?: Json
          id?: string
          monthly_fee?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          portal_email?: string | null
          portal_enabled?: boolean
          portal_token?: string
          portal_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_method?: string
          away_kit?: Json
          company?: string | null
          created_at?: string
          email?: string | null
          home_kit?: Json
          id?: string
          monthly_fee?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          portal_email?: string | null
          portal_enabled?: boolean
          portal_token?: string
          portal_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      deliverables: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          feedback: string | null
          file_name: string | null
          file_path: string | null
          id: string
          kind: string
          project_id: string | null
          status: string
          title: string
          updated_at: string
          uploaded_by: string
          week_of: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          feedback?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
          uploaded_by?: string
          week_of?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          feedback?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          kind?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
          week_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          id: string
          project_id: string | null
          receipt_path: string | null
          spent_on: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description: string
          id?: string
          project_id?: string | null
          receipt_path?: string | null
          spent_on?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          project_id?: string | null
          receipt_path?: string | null
          spent_on?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string
          due_date: string | null
          id: string
          issue_date: string
          items: Json
          notes: string | null
          number: string
          paid_at: string | null
          status: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          items?: Json
          notes?: string | null
          number: string
          paid_at?: string | null
          status?: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          issue_date?: string
          items?: Json
          notes?: string | null
          number?: string
          paid_at?: string | null
          status?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          position: number
          project_id: string
          title: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          position?: number
          project_id: string
          title: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          position?: number
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_items: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          done: boolean
          done_at: string | null
          id: string
          position: number
          title: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          done?: boolean
          done_at?: string | null
          id?: string
          position?: number
          title: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          done?: boolean
          done_at?: string | null
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_packages: {
        Row: {
          active: boolean
          billing: string
          created_at: string
          description: string | null
          features: Json
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          billing?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          billing?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          accepted_name: string | null
          body: string | null
          client_id: string | null
          created_at: string
          id: string
          items: Json
          kind: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_name?: string | null
          body?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          items?: Json
          kind?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_name?: string | null
          body?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          items?: Json
          kind?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_fixtures: {
        Row: {
          client_id: string
          competition: string | null
          created_at: string
          graphics: Json
          id: string
          match_date: string
          notes: string | null
          opponent: string
          venue: string
        }
        Insert: {
          client_id: string
          competition?: string | null
          created_at?: string
          graphics?: Json
          id?: string
          match_date: string
          notes?: string | null
          opponent: string
          venue?: string
        }
        Update: {
          client_id?: string
          competition?: string | null
          created_at?: string
          graphics?: Json
          id?: string
          match_date?: string
          notes?: string | null
          opponent?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_fixtures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          client_id: string | null
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          priority: string
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          body: string | null
          created_at: string
          description: string | null
          id: string
          items: Json
          kind: string
          name: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          description?: string | null
          id?: string
          items?: Json
          kind?: string
          name: string
        }
        Update: {
          body?: string | null
          created_at?: string
          description?: string | null
          id?: string
          items?: Json
          kind?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
