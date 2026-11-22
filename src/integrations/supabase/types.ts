export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number;
          inactive_customer_days: number | null;
          phone: string | null;
          shop_name: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          inactive_customer_days?: number | null;
          phone?: string | null;
          shop_name?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          inactive_customer_days?: number | null;
          phone?: string | null;
          shop_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      backups: {
        Row: {
          created_at: string;
          data: Json;
          id: string;
          size_bytes: number;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          data: Json;
          id?: string;
          size_bytes?: number;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          data?: Json;
          id?: string;
          size_bytes?: number;
          user_id?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          next_seq: number;
          prefix: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          next_seq?: number;
          prefix?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          next_seq?: number;
          prefix?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          active: boolean;
          address: string;
          balance_yer: number;
          created_at: string;
          credit_limit_yer: number;
          customer_type: string;
          id: string;
          inactive_alert_enabled: boolean;
          last_sale_at: string | null;
          name: string;
          phone: string;
          secondary_phone: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: string;
          balance_yer?: number;
          created_at?: string;
          credit_limit_yer?: number;
          customer_type?: string;
          id?: string;
          inactive_alert_enabled?: boolean;
          last_sale_at?: string | null;
          name: string;
          phone?: string;
          secondary_phone?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: string;
          balance_yer?: number;
          created_at?: string;
          credit_limit_yer?: number;
          customer_type?: string;
          id?: string;
          inactive_alert_enabled?: boolean;
          last_sale_at?: string | null;
          name?: string;
          phone?: string;
          secondary_phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      currencies: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          is_base: boolean;
          name: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          is_base?: boolean;
          name: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          is_base?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      daily_cash_closings: {
        Row: {
          business_date: string;
          counted_amount: number;
          closed_at: string;
          closed_by: string | null;
          currency_code: string;
          difference: number;
          expected_amount: number;
          notes: string | null;
          opening_amount: number;
        };
        Insert: {
          business_date: string;
          counted_amount: number;
          closed_at?: string;
          closed_by?: string | null;
          currency_code: string;
          difference: number;
          expected_amount: number;
          notes?: string | null;
          opening_amount: number;
        };
        Update: {
          business_date?: string;
          counted_amount?: number;
          closed_at?: string;
          closed_by?: string | null;
          currency_code?: string;
          difference?: number;
          expected_amount?: number;
          notes?: string | null;
          opening_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "daily_cash_closings_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      custom_fields: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
          options: string[];
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          options?: string[];
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          options?: string[];
        };
        Relationships: [];
      };
      cash_transactions: {
        Row: {
          affects_drawer: boolean;
          amount: number;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          id: string;
          payment_method: string;
          rate_to_yer: number;
          source_id: string;
          source_type: string;
        };
        Insert: {
          affects_drawer?: boolean;
          amount: number;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          id?: string;
          payment_method: string;
          rate_to_yer: number;
          source_id: string;
          source_type: string;
        };
        Update: {
          affects_drawer?: boolean;
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          id?: string;
          payment_method?: string;
          rate_to_yer?: number;
          source_id?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cash_transactions_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      sales_invoices: {
        Row: {
          affects_drawer: boolean;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          customer_id: string | null;
          customer_name: string | null;
          discount_yer: number;
          exchange_rate_to_yer: number;
          id: string;
          notes: string | null;
          number: number;
          paid_amount: number;
          payment_method: string;
          posted_at: string | null;
          status: string;
          subtotal_yer: number;
          tax_yer: number;
          total_yer: number;
          warehouse_id: string;
        };
        Insert: {
          affects_drawer?: boolean;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          customer_id?: string | null;
          customer_name?: string | null;
          discount_yer?: number;
          exchange_rate_to_yer: number;
          id?: string;
          notes?: string | null;
          number?: number;
          paid_amount?: number;
          payment_method?: string;
          posted_at?: string | null;
          status?: string;
          subtotal_yer?: number;
          tax_yer?: number;
          total_yer?: number;
          warehouse_id: string;
        };
        Update: {
          affects_drawer?: boolean;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          customer_id?: string | null;
          customer_name?: string | null;
          discount_yer?: number;
          exchange_rate_to_yer?: number;
          id?: string;
          notes?: string | null;
          number?: number;
          paid_amount?: number;
          payment_method?: string;
          posted_at?: string | null;
          status?: string;
          subtotal_yer?: number;
          tax_yer?: number;
          total_yer?: number;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_invoices_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "sales_invoices_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_invoices_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_items: {
        Row: {
          id: string;
          invoice_id: string;
          price_tier: string;
          product_id: string;
          quantity: number;
          total_yer: number;
          unit_price_yer: number;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          price_tier?: string;
          product_id: string;
          quantity: number;
          total_yer: number;
          unit_price_yer: number;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          price_tier?: string;
          product_id?: string;
          quantity?: number;
          total_yer?: number;
          unit_price_yer?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      vouchers: {
        Row: {
          affects_drawer: boolean;
          amount: number;
          category: string;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          customer_id: string | null;
          exchange_rate_to_yer: number;
          id: string;
          kind: string;
          notes: string | null;
          number: number;
          payee: string | null;
          payment_method: string;
          posted_at: string | null;
          status: string;
        };
        Insert: {
          affects_drawer?: boolean;
          amount: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          customer_id?: string | null;
          exchange_rate_to_yer: number;
          id?: string;
          kind: string;
          notes?: string | null;
          number?: number;
          payee?: string | null;
          payment_method?: string;
          posted_at?: string | null;
          status?: string;
        };
        Update: {
          affects_drawer?: boolean;
          amount?: number;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          customer_id?: string | null;
          exchange_rate_to_yer?: number;
          id?: string;
          kind?: string;
          notes?: string | null;
          number?: number;
          payee?: string | null;
          payment_method?: string;
          posted_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vouchers_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "vouchers_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      exchange_rates: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency_code: string;
          effective_at: string;
          id: string;
          rate_to_yer: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          effective_at?: string;
          id?: string;
          rate_to_yer: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          effective_at?: string;
          id?: string;
          rate_to_yer?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exchange_rates_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      employee_permissions: {
        Row: {
          actions: string[];
          fields: string[];
          pages: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          actions?: string[];
          fields?: string[];
          pages?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          actions?: string[];
          fields?: string[];
          pages?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          attributes: Json;
          barcode: string | null;
          category_id: string | null;
          code: string | null;
          cost: number;
          created_at: string;
          custom_barcode: string | null;
          description: string | null;
          expiry_date: string | null;
          id: string;
          image_url: string | null;
          major_unit: string | null;
          model_no: string | null;
          name: string;
          pack_capacity: number;
          price: number;
          price_bulk: number;
          price_half: number;
          price_special: number;
          price_wholesale: number;
          reorder_level: number;
          reorder_qty: number;
          shelf: string | null;
          supplier: string | null;
          unit: string;
          updated_at: string;
          warehouse_id: string | null;
        };
        Insert: {
          attributes?: Json;
          barcode?: string | null;
          category_id?: string | null;
          code?: string | null;
          cost?: number;
          created_at?: string;
          custom_barcode?: string | null;
          description?: string | null;
          expiry_date?: string | null;
          id?: string;
          image_url?: string | null;
          major_unit?: string | null;
          model_no?: string | null;
          name: string;
          pack_capacity?: number;
          price?: number;
          price_bulk?: number;
          price_half?: number;
          price_special?: number;
          price_wholesale?: number;
          reorder_level?: number;
          reorder_qty?: number;
          shelf?: string | null;
          supplier?: string | null;
          unit?: string;
          updated_at?: string;
          warehouse_id?: string | null;
        };
        Update: {
          attributes?: Json;
          barcode?: string | null;
          category_id?: string | null;
          code?: string | null;
          cost?: number;
          created_at?: string;
          custom_barcode?: string | null;
          description?: string | null;
          expiry_date?: string | null;
          id?: string;
          image_url?: string | null;
          major_unit?: string | null;
          model_no?: string | null;
          name?: string;
          pack_capacity?: number;
          price?: number;
          price_bulk?: number;
          price_half?: number;
          price_special?: number;
          price_wholesale?: number;
          reorder_level?: number;
          reorder_qty?: number;
          shelf?: string | null;
          supplier?: string | null;
          unit?: string;
          updated_at?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      product_suppliers: {
        Row: {
          is_primary: boolean;
          last_cost: number;
          product_id: string;
          supplier_id: string;
          supplier_sku: string | null;
          updated_at: string;
        };
        Insert: {
          is_primary?: boolean;
          last_cost?: number;
          product_id: string;
          supplier_id: string;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Update: {
          is_primary?: boolean;
          last_cost?: number;
          product_id?: string;
          supplier_id?: string;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          username: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          username?: string;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          number: number;
          purchase_invoice_id: string | null;
          received_at: string | null;
          status: string;
          submitted_at: string | null;
          supplier_id: string;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          number?: number;
          purchase_invoice_id?: string | null;
          received_at?: string | null;
          status?: string;
          submitted_at?: string | null;
          supplier_id: string;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          number?: number;
          purchase_invoice_id?: string | null;
          received_at?: string | null;
          status?: string;
          submitted_at?: string | null;
          supplier_id?: string;
          warehouse_id?: string;
        };
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          quantity?: number;
          unit_cost?: number;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          active: boolean;
          address: string;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          phone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: string;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: string;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchase_invoices: {
        Row: {
          created_at: string;
          id: string;
          number: number;
          supplier: string | null;
          total: number;
          user_id: string | null;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          number?: number;
          supplier?: string | null;
          total?: number;
          user_id?: string | null;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          number?: number;
          supplier?: string | null;
          total?: number;
          user_id?: string | null;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_items: {
        Row: {
          cost: number;
          id: string;
          invoice_id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          cost?: number;
          id?: string;
          invoice_id: string;
          product_id: string;
          quantity: number;
        };
        Update: {
          cost?: number;
          id?: string;
          invoice_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "purchase_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      reorder_requests: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          quantity: number;
          received_at: string | null;
          status: string;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          quantity: number;
          received_at?: string | null;
          status?: string;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          received_at?: string | null;
          status?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reorder_requests_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reorder_requests_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      shelf_stock: {
        Row: {
          product_id: string;
          quantity: number;
          shelf: string;
          updated_at: string;
          warehouse_id: string;
        };
        Insert: {
          product_id: string;
          quantity?: number;
          shelf: string;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          product_id?: string;
          quantity?: number;
          shelf?: string;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shelf_stock_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shelf_stock_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      stock: {
        Row: {
          product_id: string;
          quantity: number;
          updated_at: string;
          warehouse_id: string;
        };
        Insert: {
          product_id: string;
          quantity?: number;
          updated_at?: string;
          warehouse_id: string;
        };
        Update: {
          product_id?: string;
          quantity?: number;
          updated_at?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_minimums: {
        Row: {
          min_qty: number;
          product_id: string;
          warehouse_id: string;
        };
        Insert: {
          min_qty?: number;
          product_id: string;
          warehouse_id: string;
        };
        Update: {
          min_qty?: number;
          product_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_minimums_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_minimums_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          note: string | null;
          product_id: string;
          quantity: number;
          user_id: string | null;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          note?: string | null;
          product_id: string;
          quantity: number;
          user_id?: string | null;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          note?: string | null;
          product_id?: string;
          quantity?: number;
          user_id?: string | null;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      units: {
        Row: {
          created_at: string;
          factor: number;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          factor?: number;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          factor?: number;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      warehouses: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_purge: {
        Args: { _scope: string; _warehouse?: string };
        Returns: undefined;
      };
      archive_customer: { Args: { _id: string }; Returns: undefined };
      archive_supplier: { Args: { _id: string }; Returns: undefined };
      can_manage_stock: { Args: { _user_id: string }; Returns: boolean };
      close_daily_cash: {
        Args: { _business_date: string; _counts: Json; _notes?: string | null };
        Returns: undefined;
      };
      ean13: { Args: { _d12: string }; Returns: string };
      employee_can: {
        Args: { _key: string; _kind: string; _user_id: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      post_purchase: {
        Args: { _items: Json; _supplier: string; _warehouse: string };
        Returns: string;
      };
      post_sale: { Args: { _id: string }; Returns: undefined };
      post_voucher: { Args: { _id: string }; Returns: undefined };
      receive_reorder: { Args: { _id: string }; Returns: undefined };
      receive_purchase_order: { Args: { _id: string }; Returns: string };
      save_customer: {
        Args: {
          _address: string;
          _credit_limit_yer: number;
          _customer_type: string;
          _id: string | null;
          _inactive_alert_enabled: boolean;
          _name: string;
          _phone: string;
          _secondary_phone: string | null;
        };
        Returns: string;
      };
      save_product_attributes: {
        Args: { _attributes: Json; _product: string };
        Returns: undefined;
      };
      save_product_supplier: {
        Args: {
          _is_primary: boolean;
          _last_cost: number;
          _product_id: string;
          _supplier_id: string;
          _supplier_sku: string | null;
        };
        Returns: undefined;
      };
      save_supplier: {
        Args: {
          _address: string;
          _id: string | null;
          _name: string;
          _notes: string | null;
          _phone: string;
        };
        Returns: string;
      };
      set_initial_stocks: { Args: { _balances: Json; _product: string }; Returns: undefined };
      save_purchase_order_draft: {
        Args: {
          _id: string | null;
          _items: Json;
          _notes: string | null;
          _supplier_id: string;
          _warehouse: string;
        };
        Returns: string;
      };
      submit_purchase_order: { Args: { _id: string }; Returns: undefined };
      save_sale_draft: {
        Args: {
          _affects_drawer: boolean;
          _currency_code: string;
          _customer_id: string | null;
          _customer_name: string | null;
          _discount_yer: number;
          _id: string | null;
          _items: Json;
          _notes: string | null;
          _paid_amount: number;
          _payment_method: string;
          _rate_to_yer: number;
          _tax_yer: number;
          _warehouse: string;
        };
        Returns: string;
      };
      save_voucher_draft: {
        Args: {
          _affects_drawer: boolean;
          _amount: number;
          _category: string;
          _currency_code: string;
          _customer_id: string | null;
          _id: string | null;
          _kind: string;
          _notes: string | null;
          _payee: string | null;
          _payment_method: string;
          _rate_to_yer: number;
        };
        Returns: string;
      };
      set_stock: {
        Args: {
          _kind?: string;
          _product: string;
          _qty: number;
          _warehouse: string;
        };
        Returns: undefined;
      };
      transfer_shelf_stock: {
        Args: {
          _from_shelf: string;
          _from_wh: string;
          _product: string;
          _qty: number;
          _to_shelf: string;
          _to_wh: string;
        };
        Returns: undefined;
      };
      transfer_stock: {
        Args: { _from: string; _product: string; _qty: number; _to: string };
        Returns: undefined;
      };
      visible_products: { Args: never; Returns: Json[] };
    };
    Enums: {
      app_role: "admin" | "storekeeper" | "cashier";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "storekeeper", "cashier"],
    },
  },
} as const;
