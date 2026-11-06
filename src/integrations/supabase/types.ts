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
      app_settings: {
        Row: {
          id: number
          phone: string | null
          shop_name: string
          updated_at: string
        }
        Insert: {
          id?: number
          phone?: string | null
          shop_name?: string
          updated_at?: string
        }
        Update: {
          id?: number
          phone?: string | null
          shop_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      backups: {
        Row: {
          created_at: string
          data: Json
          id: string
          size_bytes: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          size_bytes?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          size_bytes?: number
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          next_seq: number
          prefix: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          next_seq?: number
          prefix?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          next_seq?: number
          prefix?: string
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          options: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          options?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          options?: string[]
        }
        Relationships: []
      }
      products: {
        Row: {
          attributes: Json
          barcode: string | null
          category_id: string | null
          code: string | null
          cost: number
          created_at: string
          custom_barcode: string | null
          description: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          major_unit: string | null
          model_no: string | null
          name: string
          pack_capacity: number
          price: number
          price_bulk: number
          price_half: number
          price_special: number
          price_wholesale: number
          reorder_level: number
          reorder_qty: number
          shelf: string | null
          unit: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          category_id?: string | null
          code?: string | null
          cost?: number
          created_at?: string
          custom_barcode?: string | null
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          major_unit?: string | null
          model_no?: string | null
          name: string
          pack_capacity?: number
          price?: number
          price_bulk?: number
          price_half?: number
          price_special?: number
          price_wholesale?: number
          reorder_level?: number
          reorder_qty?: number
          shelf?: string | null
          unit?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          category_id?: string | null
          code?: string | null
          cost?: number
          created_at?: string
          custom_barcode?: string | null
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          major_unit?: string | null
          model_no?: string | null
          name?: string
          pack_capacity?: number
          price?: number
          price_bulk?: number
          price_half?: number
          price_special?: number
          price_wholesale?: number
          reorder_level?: number
          reorder_qty?: number
          shelf?: string | null
          unit?: string
          updated_at?: string
          warehouse_id?: string | null
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
            foreignKeyName: "products_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      purchase_invoices: {
        Row: {
          created_at: string
          id: string
          number: number
          supplier: string | null
          total: number
          user_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          number?: number
          supplier?: string | null
          total?: number
          user_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          number?: number
          supplier?: string | null
          total?: number
          user_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          cost: number
          id: string
          invoice_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          cost?: number
          id?: string
          invoice_id: string
          product_id: string
          quantity: number
        }
        Update: {
          cost?: number
          id?: string
          invoice_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_requests: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          received_at: string | null
          status: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          received_at?: string | null
          status?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          received_at?: string | null
          status?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_requests_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          product_id: string
          quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          product_id: string
          quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          product_id?: string
          quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_minimums: {
        Row: {
          min_qty: number
          product_id: string
          warehouse_id: string
        }
        Insert: {
          min_qty?: number
          product_id: string
          warehouse_id: string
        }
        Update: {
          min_qty?: number
          product_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_minimums_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_minimums_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          product_id: string
          quantity: number
          user_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          product_id: string
          quantity: number
          user_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          product_id?: string
          quantity?: number
          user_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          factor: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          factor?: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          factor?: number
          id?: string
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
      warehouses: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_stock: { Args: { _user_id: string }; Returns: boolean }
      ean13: { Args: { _d12: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      post_purchase: {
        Args: { _items: Json; _supplier: string; _warehouse: string }
        Returns: string
      }
      receive_reorder: { Args: { _id: string }; Returns: undefined }
      set_stock: {
        Args: {
          _kind?: string
          _product: string
          _qty: number
          _warehouse: string
        }
        Returns: undefined
      }
      transfer_stock: {
        Args: { _from: string; _product: string; _qty: number; _to: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "storekeeper" | "cashier"
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
      app_role: ["admin", "storekeeper", "cashier"],
    },
  },
} as const
