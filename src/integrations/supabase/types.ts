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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      client_locations: {
        Row: {
          address: string
          city: string | null
          client_id: string
          country: string | null
          created_at: string
          id: string
          label: string
          location_type: string
          max_vehicle_length: string | null
          notes: string | null
          time_window_end: string | null
          time_window_start: string | null
          zipcode: string | null
        }
        Insert: {
          address: string
          city?: string | null
          client_id: string
          country?: string | null
          created_at?: string
          id?: string
          label: string
          location_type?: string
          max_vehicle_length?: string | null
          notes?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          zipcode?: string | null
        }
        Update: {
          address?: string
          city?: string | null
          client_id?: string
          country?: string | null
          created_at?: string
          id?: string
          label?: string
          location_type?: string
          max_vehicle_length?: string | null
          notes?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          zipcode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_rates: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string | null
          description: string | null
          id: string
          is_active: boolean | null
          rate_type: string
        }
        Insert: {
          amount?: number
          client_id: string
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          rate_type: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          rate_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_rates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          btw_number: string | null
          city: string | null
          contact_person: string | null
          country: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          kvk_number: string | null
          name: string
          payment_terms: number | null
          phone: string | null
          zipcode: string | null
        }
        Insert: {
          address?: string | null
          btw_number?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          kvk_number?: string | null
          name: string
          payment_terms?: number | null
          phone?: string | null
          zipcode?: string | null
        }
        Update: {
          address?: string | null
          btw_number?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          kvk_number?: string | null
          name?: string
          payment_terms?: number | null
          phone?: string | null
          zipcode?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          order_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          order_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          order_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          anomalies: Json | null
          attachments: Json | null
          barcode: string | null
          changes_detected: Json | null
          client_name: string | null
          confidence_score: number | null
          created_at: string
          delivery_address: string | null
          dimensions: string | null
          follow_up_draft: string | null
          follow_up_sent_at: string | null
          id: string
          internal_note: string | null
          invoice_ref: string | null
          is_weight_per_unit: boolean
          missing_fields: string[] | null
          order_number: number
          parent_order_id: string | null
          pickup_address: string | null
          quantity: number | null
          received_at: string | null
          requirements: string[] | null
          source_email_body: string | null
          source_email_from: string | null
          source_email_subject: string | null
          status: string
          stop_sequence: number | null
          thread_type: string
          transport_type: string | null
          unit: string | null
          updated_at: string
          vehicle_id: string | null
          weight_kg: number | null
        }
        Insert: {
          anomalies?: Json | null
          attachments?: Json | null
          barcode?: string | null
          changes_detected?: Json | null
          client_name?: string | null
          confidence_score?: number | null
          created_at?: string
          delivery_address?: string | null
          dimensions?: string | null
          follow_up_draft?: string | null
          follow_up_sent_at?: string | null
          id?: string
          internal_note?: string | null
          invoice_ref?: string | null
          is_weight_per_unit?: boolean
          missing_fields?: string[] | null
          order_number?: number
          parent_order_id?: string | null
          pickup_address?: string | null
          quantity?: number | null
          received_at?: string | null
          requirements?: string[] | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_subject?: string | null
          status?: string
          stop_sequence?: number | null
          thread_type?: string
          transport_type?: string | null
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          anomalies?: Json | null
          attachments?: Json | null
          barcode?: string | null
          changes_detected?: Json | null
          client_name?: string | null
          confidence_score?: number | null
          created_at?: string
          delivery_address?: string | null
          dimensions?: string | null
          follow_up_draft?: string | null
          follow_up_sent_at?: string | null
          id?: string
          internal_note?: string | null
          invoice_ref?: string | null
          is_weight_per_unit?: boolean
          missing_fields?: string[] | null
          order_number?: number
          parent_order_id?: string | null
          pickup_address?: string | null
          quantity?: number | null
          received_at?: string | null
          requirements?: string[] | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_subject?: string | null
          status?: string
          stop_sequence?: number | null
          thread_type?: string
          transport_type?: string | null
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
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
      vehicle_availability: {
        Row: {
          created_at: string
          date: string
          id: string
          reason: string | null
          status: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          reason?: string | null
          status?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          reason?: string | null
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_availability_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          created_at: string
          doc_type: string
          expiry_date: string | null
          file_url: string | null
          id: string
          notes: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance: {
        Row: {
          completed_date: string | null
          cost: number | null
          created_at: string
          description: string | null
          id: string
          maintenance_type: string
          mileage_km: number | null
          scheduled_date: string | null
          vehicle_id: string
        }
        Insert: {
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          maintenance_type?: string
          mileage_km?: number | null
          scheduled_date?: string | null
          vehicle_id: string
        }
        Update: {
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          maintenance_type?: string
          mileage_km?: number | null
          scheduled_date?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_driver: string | null
          brand: string | null
          build_year: number | null
          capacity_kg: number
          capacity_pallets: number
          cargo_height_cm: number | null
          cargo_length_cm: number | null
          cargo_width_cm: number | null
          code: string
          created_at: string
          features: string[]
          fuel_consumption: number | null
          id: string
          is_active: boolean
          name: string
          plate: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_driver?: string | null
          brand?: string | null
          build_year?: number | null
          capacity_kg?: number
          capacity_pallets?: number
          cargo_height_cm?: number | null
          cargo_length_cm?: number | null
          cargo_width_cm?: number | null
          code: string
          created_at?: string
          features?: string[]
          fuel_consumption?: number | null
          id?: string
          is_active?: boolean
          name: string
          plate: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          assigned_driver?: string | null
          brand?: string | null
          build_year?: number | null
          capacity_kg?: number
          capacity_pallets?: number
          cargo_height_cm?: number | null
          cargo_length_cm?: number | null
          cargo_width_cm?: number | null
          code?: string
          created_at?: string
          features?: string[]
          fuel_consumption?: number | null
          id?: string
          is_active?: boolean
          name?: string
          plate?: string
          status?: string
          type?: string
          updated_at?: string
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
      app_role: "admin" | "medewerker"
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
      app_role: ["admin", "medewerker"],
    },
  },
} as const
