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
      activity_log: {
        Row: {
          id: string
          tenant_id: string
          user_id: string | null
          entity_type: string
          entity_id: string
          action: string
          changes: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id?: string | null
          entity_type: string
          entity_id: string
          action: string
          changes?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string | null
          entity_type?: string
          entity_id?: string
          action?: string
          changes?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_corrections: {
        Row: {
          id: string
          order_id: string | null
          client_name: string | null
          field_name: string
          ai_value: string | null
          corrected_value: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          client_name?: string | null
          field_name: string
          ai_value?: string | null
          corrected_value: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string | null
          client_name?: string | null
          field_name?: string
          ai_value?: string | null
          corrected_value?: string
          created_at?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          id: string
          tenant_id: string
          function_name: string
          model: string
          input_tokens: number | null
          output_tokens: number | null
          cost_estimate: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          function_name: string
          model?: string
          input_tokens?: number | null
          output_tokens?: number | null
          cost_estimate?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          function_name?: string
          model?: string
          input_tokens?: number | null
          output_tokens?: number | null
          cost_estimate?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: string
          old_data: Json | null
          new_data: Json | null
          changed_fields: string[] | null
          user_id: string | null
          user_email: string | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          action: string
          old_data?: Json | null
          new_data?: Json | null
          changed_fields?: string[] | null
          user_id?: string | null
          user_email?: string | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          action?: string
          old_data?: Json | null
          new_data?: Json | null
          changed_fields?: string[] | null
          user_id?: string | null
          user_email?: string | null
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      client_extraction_templates: {
        Row: {
          id: string
          tenant_id: string
          client_email: string
          field_mappings: Json
          success_count: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          client_email: string
          field_mappings?: Json
          success_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          client_email?: string
          field_mappings?: Json
          success_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_extraction_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "client_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_rates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          zipcode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_exceptions: {
        Row: {
          id: string
          tenant_id: string
          trip_id: string | null
          trip_stop_id: string | null
          order_id: string | null
          exception_type: string
          severity: string
          description: string
          owner_id: string | null
          status: string
          blocks_billing: boolean
          resolution_notes: string | null
          created_at: string
          resolved_at: string | null
          escalated_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          trip_id?: string | null
          trip_stop_id?: string | null
          order_id?: string | null
          exception_type: string
          severity?: string
          description: string
          owner_id?: string | null
          status?: string
          blocks_billing?: boolean
          resolution_notes?: string | null
          created_at?: string
          resolved_at?: string | null
          escalated_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          trip_id?: string | null
          trip_stop_id?: string | null
          order_id?: string | null
          exception_type?: string
          severity?: string
          description?: string
          owner_id?: string | null
          status?: string
          blocks_billing?: boolean
          resolution_notes?: string | null
          created_at?: string
          resolved_at?: string | null
          escalated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_exceptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_exceptions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_exceptions_trip_stop_id_fkey"
            columns: ["trip_stop_id"]
            isOneToOne: false
            referencedRelation: "trip_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_positions: {
        Row: {
          id: string
          tenant_id: string | null
          driver_id: string
          latitude: number
          longitude: number
          accuracy: number | null
          speed: number | null
          heading: number | null
          recorded_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          driver_id: string
          latitude: number
          longitude: number
          accuracy?: number | null
          speed?: number | null
          heading?: number | null
          recorded_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          driver_id?: string
          latitude?: number
          longitude?: number
          accuracy?: number | null
          speed?: number | null
          heading?: number | null
          recorded_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_positions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_time_entries: {
        Row: {
          id: string
          tenant_id: string | null
          driver_id: string
          entry_type: string
          recorded_at: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          driver_id: string
          entry_type: string
          recorded_at?: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          driver_id?: string
          entry_type?: string
          recorded_at?: string
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_time_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          id: string
          tenant_id: string
          name: string
          email: string | null
          phone: string | null
          license_number: string | null
          certifications: string[]
          status: string
          current_vehicle_id: string | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          email?: string | null
          phone?: string | null
          license_number?: string | null
          certifications?: string[]
          status?: string
          current_vehicle_id?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          license_number?: string | null
          certifications?: string[]
          status?: string
          current_vehicle_id?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_current_vehicle_id_fkey"
            columns: ["current_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          id: string
          invoice_id: string
          order_id: string | null
          description: string
          quantity: number
          unit: string
          unit_price: number
          total: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          order_id?: string | null
          description: string
          quantity?: number
          unit?: string
          unit_price?: number
          total?: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          order_id?: string | null
          description?: string
          quantity?: number
          unit?: string
          unit_price?: number
          total?: number
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          tenant_id: string
          invoice_number: string
          client_id: string | null
          client_name: string | null
          client_address: string | null
          client_btw_number: string | null
          client_kvk_number: string | null
          status: string
          invoice_date: string
          due_date: string | null
          subtotal: number
          btw_percentage: number
          btw_amount: number
          total: number
          notes: string | null
          pdf_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          invoice_number: string
          client_id?: string | null
          client_name?: string | null
          client_address?: string | null
          client_btw_number?: string | null
          client_kvk_number?: string | null
          status?: string
          invoice_date?: string
          due_date?: string | null
          subtotal?: number
          btw_percentage?: number
          btw_amount?: number
          total?: number
          notes?: string | null
          pdf_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          invoice_number?: string
          client_id?: string | null
          client_name?: string | null
          client_address?: string | null
          client_btw_number?: string | null
          client_kvk_number?: string | null
          status?: string
          invoice_date?: string
          due_date?: string | null
          subtotal?: number
          btw_percentage?: number
          btw_amount?: number
          total?: number
          notes?: string | null
          pdf_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      loading_units: {
        Row: {
          id: string
          tenant_id: string
          name: string
          code: string
          default_weight_kg: number | null
          default_dimensions: string | null
          is_active: boolean | null
          sort_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          code: string
          default_weight_kg?: number | null
          default_dimensions?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          code?: string
          default_weight_kg?: number | null
          default_dimensions?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loading_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_movements: {
        Row: {
          id: string
          tenant_id: string
          client_id: string
          order_id: string | null
          trip_stop_id: string | null
          loading_unit_id: string
          direction: string
          quantity: number
          recorded_by: string | null
          recorded_at: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          client_id: string
          order_id?: string | null
          trip_stop_id?: string | null
          loading_unit_id: string
          direction: string
          quantity: number
          recorded_by?: string | null
          recorded_at?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          client_id?: string
          order_id?: string | null
          trip_stop_id?: string | null
          loading_unit_id?: string
          direction?: string
          quantity?: number
          recorded_by?: string | null
          recorded_at?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packaging_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packaging_movements_loading_unit_id_fkey"
            columns: ["loading_unit_id"]
            isOneToOne: false
            referencedRelation: "loading_units"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          order_id?: string | null
          tenant_id: string
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          order_id?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          anomalies: Json | null
          attachments: Json | null
          barcode: string | null
          billing_blocked_reason: string | null
          billing_ready_at: string | null
          billing_status: string | null
          changes_detected: Json | null
          client_name: string | null
          cmr_generated_at: string | null
          cmr_number: string | null
          confidence_score: number | null
          created_at: string
          delivery_address: string | null
          dimensions: string | null
          driver_id: string | null
          follow_up_draft: string | null
          follow_up_sent_at: string | null
          geocoded_delivery_lat: number | null
          geocoded_delivery_lng: number | null
          geocoded_pickup_lat: number | null
          geocoded_pickup_lng: number | null
          id: string
          internal_note: string | null
          invoice_id: string | null
          invoice_ref: string | null
          is_weight_per_unit: boolean
          missing_fields: string[] | null
          order_number: number
          parent_order_id: string | null
          pickup_address: string | null
          pod_notes: string | null
          pod_photos: Json | null
          pod_signature_url: string | null
          pod_signed_at: string | null
          pod_signed_by: string | null
          priority: string
          quantity: number | null
          received_at: string | null
          requirements: string[] | null
          source_email_body: string | null
          source_email_from: string | null
          source_email_subject: string | null
          status: string
          stop_sequence: number | null
          tenant_id: string
          thread_type: string
          time_window_end: string | null
          time_window_start: string | null
          transport_type: string | null
          unit: string | null
          updated_at: string
          vehicle_id: string | null
          warehouse_received_at: string | null
          weight_kg: number | null
          order_type: string
          return_reason: string | null
        }
        Insert: {
          anomalies?: Json | null
          attachments?: Json | null
          barcode?: string | null
          billing_blocked_reason?: string | null
          billing_ready_at?: string | null
          billing_status?: string | null
          changes_detected?: Json | null
          client_name?: string | null
          cmr_generated_at?: string | null
          cmr_number?: string | null
          confidence_score?: number | null
          created_at?: string
          delivery_address?: string | null
          dimensions?: string | null
          driver_id?: string | null
          follow_up_draft?: string | null
          follow_up_sent_at?: string | null
          geocoded_delivery_lat?: number | null
          geocoded_delivery_lng?: number | null
          geocoded_pickup_lat?: number | null
          geocoded_pickup_lng?: number | null
          id?: string
          internal_note?: string | null
          invoice_id?: string | null
          invoice_ref?: string | null
          is_weight_per_unit?: boolean
          missing_fields?: string[] | null
          order_number?: number
          parent_order_id?: string | null
          pickup_address?: string | null
          pod_notes?: string | null
          pod_photos?: Json | null
          pod_signature_url?: string | null
          pod_signed_at?: string | null
          pod_signed_by?: string | null
          priority?: string
          quantity?: number | null
          received_at?: string | null
          requirements?: string[] | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_subject?: string | null
          status?: string
          stop_sequence?: number | null
          tenant_id: string
          thread_type?: string
          time_window_end?: string | null
          time_window_start?: string | null
          transport_type?: string | null
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
          warehouse_received_at?: string | null
          weight_kg?: number | null
          order_type?: string
          return_reason?: string | null
        }
        Update: {
          anomalies?: Json | null
          attachments?: Json | null
          barcode?: string | null
          billing_blocked_reason?: string | null
          billing_ready_at?: string | null
          billing_status?: string | null
          changes_detected?: Json | null
          client_name?: string | null
          cmr_generated_at?: string | null
          cmr_number?: string | null
          confidence_score?: number | null
          created_at?: string
          delivery_address?: string | null
          dimensions?: string | null
          driver_id?: string | null
          follow_up_draft?: string | null
          follow_up_sent_at?: string | null
          geocoded_delivery_lat?: number | null
          geocoded_delivery_lng?: number | null
          geocoded_pickup_lat?: number | null
          geocoded_pickup_lng?: number | null
          id?: string
          internal_note?: string | null
          invoice_id?: string | null
          invoice_ref?: string | null
          is_weight_per_unit?: boolean
          missing_fields?: string[] | null
          order_number?: number
          parent_order_id?: string | null
          pickup_address?: string | null
          pod_notes?: string | null
          pod_photos?: Json | null
          pod_signature_url?: string | null
          pod_signed_at?: string | null
          pod_signed_by?: string | null
          priority?: string
          quantity?: number | null
          received_at?: string | null
          requirements?: string[] | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_subject?: string | null
          status?: string
          stop_sequence?: number | null
          tenant_id?: string
          thread_type?: string
          time_window_end?: string | null
          time_window_start?: string | null
          transport_type?: string | null
          unit?: string | null
          updated_at?: string
          vehicle_id?: string | null
          warehouse_received_at?: string | null
          weight_kg?: number | null
          order_type?: string
          return_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      proof_of_delivery: {
        Row: {
          id: string
          trip_stop_id: string
          order_id: string | null
          pod_status: string
          signature_url: string | null
          photos: Json | null
          recipient_name: string | null
          received_at: string | null
          validated_by: string | null
          validated_at: string | null
          rejection_reason: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trip_stop_id: string
          order_id?: string | null
          pod_status?: string
          signature_url?: string | null
          photos?: Json | null
          recipient_name?: string | null
          received_at?: string | null
          validated_by?: string | null
          validated_at?: string | null
          rejection_reason?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trip_stop_id?: string
          order_id?: string | null
          pod_status?: string
          signature_url?: string | null
          photos?: Json | null
          recipient_name?: string | null
          received_at?: string | null
          validated_by?: string | null
          validated_at?: string | null
          rejection_reason?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_delivery_trip_stop_id_fkey"
            columns: ["trip_stop_id"]
            isOneToOne: false
            referencedRelation: "trip_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_types: {
        Row: {
          id: string
          tenant_id: string
          name: string
          code: string
          category: string | null
          icon: string | null
          color: string | null
          is_active: boolean | null
          sort_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          code: string
          category?: string | null
          icon?: string | null
          color?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          code?: string
          category?: string | null
          icon?: string | null
          color?: string | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_members: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          primary_color: string | null
          settings: Json | null
          is_active: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          primary_color?: string | null
          settings?: Json | null
          is_active?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          logo_url?: string | null
          primary_color?: string | null
          settings?: Json | null
          is_active?: boolean | null
          created_at?: string
        }
        Relationships: []
      }
      trip_stops: {
        Row: {
          id: string
          trip_id: string
          order_id: string | null
          stop_type: string
          stop_sequence: number
          stop_status: string
          planned_address: string | null
          planned_time: string | null
          actual_arrival_time: string | null
          actual_departure_time: string | null
          contact_name: string | null
          contact_phone: string | null
          instructions: string | null
          failure_reason: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          order_id?: string | null
          stop_type: string
          stop_sequence: number
          stop_status?: string
          planned_address?: string | null
          planned_time?: string | null
          actual_arrival_time?: string | null
          actual_departure_time?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          instructions?: string | null
          failure_reason?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          order_id?: string | null
          stop_type?: string
          stop_sequence?: number
          stop_status?: string
          planned_address?: string | null
          planned_time?: string | null
          actual_arrival_time?: string | null
          actual_departure_time?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          instructions?: string | null
          failure_reason?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          id: string
          tenant_id: string
          trip_number: number
          vehicle_id: string
          driver_id: string | null
          dispatch_status: string
          planned_date: string
          planned_start_time: string | null
          actual_start_time: string | null
          actual_end_time: string | null
          total_distance_km: number | null
          total_duration_min: number | null
          dispatcher_id: string | null
          dispatched_at: string | null
          received_at: string | null
          accepted_at: string | null
          started_at: string | null
          completed_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          trip_number?: number
          vehicle_id: string
          driver_id?: string | null
          dispatch_status?: string
          planned_date: string
          planned_start_time?: string | null
          actual_start_time?: string | null
          actual_end_time?: string | null
          total_distance_km?: number | null
          total_duration_min?: number | null
          dispatcher_id?: string | null
          dispatched_at?: string | null
          received_at?: string | null
          accepted_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          trip_number?: number
          vehicle_id?: string
          driver_id?: string | null
          dispatch_status?: string
          planned_date?: string
          planned_start_time?: string | null
          actual_start_time?: string | null
          actual_end_time?: string | null
          total_distance_km?: number | null
          total_duration_min?: number | null
          dispatcher_id?: string | null
          dispatched_at?: string | null
          received_at?: string | null
          accepted_at?: string | null
          started_at?: string | null
          completed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_availability: {
        Row: {
          created_at: string
          date: string
          id: string
          reason: string | null
          status: string
          tenant_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          reason?: string | null
          status?: string
          tenant_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          reason?: string | null
          status?: string
          tenant_id?: string
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
          {
            foreignKeyName: "vehicle_availability_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          tenant_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          tenant_id?: string
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
          {
            foreignKeyName: "vehicle_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "vehicle_maintenance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_types: {
        Row: {
          id: string
          tenant_id: string
          name: string
          code: string
          default_capacity_kg: number | null
          default_capacity_pallets: number | null
          is_active: boolean | null
          sort_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          code: string
          default_capacity_kg?: number | null
          default_capacity_pallets?: number | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          code?: string
          default_capacity_kg?: number | null
          default_capacity_pallets?: number | null
          is_active?: boolean | null
          sort_order?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_subscriptions: {
        Row: {
          id: string
          tenant_id: string | null
          url: string
          events: string[]
          secret: string | null
          is_active: boolean | null
          last_triggered_at: string | null
          failure_count: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          url: string
          events?: string[]
          secret?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          failure_count?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          url?: string
          events?: string[]
          secret?: string | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          failure_count?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      packaging_balances: {
        Row: {
          tenant_id: string
          client_id: string
          loading_unit_id: string
          loading_unit_name: string
          loading_unit_code: string
          client_name: string
          balance: number
          total_movements: number
          last_movement_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      generate_invoice_number: {
        Args: {
          p_tenant_id: string
        }
        Returns: string
      }
      get_user_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
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
