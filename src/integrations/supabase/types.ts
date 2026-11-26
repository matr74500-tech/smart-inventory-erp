export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number;
          inactive_customer_days: number | null;
          payment_methods: Json;
          phone: string | null;
          shop_name: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          inactive_customer_days?: number | null;
          payment_methods?: Json;
          phone?: string | null;
          shop_name?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          inactive_customer_days?: number | null;
          payment_methods?: Json;
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
      barcode_label_settings: {
        Row: {
          created_at: string;
          custom_price: number | null;
          id: string;
          label_height_mm: number;
          label_width_mm: number;
          labels_per_page: number;
          price_category: string | null;
          price_source: string;
          printer_type: string | null;
          product_name_field: string;
          shop_name: string;
          show_barcode_image: boolean;
          show_logo: boolean;
          show_qr_code: boolean;
          singleton: boolean;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          custom_price?: number | null;
          id?: string;
          label_height_mm?: number;
          label_width_mm?: number;
          labels_per_page?: number;
          price_category?: string | null;
          price_source?: string;
          printer_type?: string | null;
          product_name_field?: string;
          shop_name?: string;
          show_barcode_image?: boolean;
          show_logo?: boolean;
          show_qr_code?: boolean;
          singleton?: boolean;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          custom_price?: number | null;
          id?: string;
          label_height_mm?: number;
          label_width_mm?: number;
          labels_per_page?: number;
          price_category?: string | null;
          price_source?: string;
          printer_type?: string | null;
          product_name_field?: string;
          shop_name?: string;
          show_barcode_image?: boolean;
          show_logo?: boolean;
          show_qr_code?: boolean;
          singleton?: boolean;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cash_shifts: {
        Row: {
          closed_at: string | null;
          closed_by: string | null;
          counted: Json | null;
          created_at: string;
          difference: Json | null;
          expected: Json | null;
          id: string;
          notes: string | null;
          opened_at: string;
          opened_by: string | null;
          opening: Json;
          status: string;
        };
        Insert: {
          closed_at?: string | null;
          closed_by?: string | null;
          counted?: Json | null;
          created_at?: string;
          difference?: Json | null;
          expected?: Json | null;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          opening?: Json;
          status?: string;
        };
        Update: {
          closed_at?: string | null;
          closed_by?: string | null;
          counted?: Json | null;
          created_at?: string;
          difference?: Json | null;
          expected?: Json | null;
          id?: string;
          notes?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          opening?: Json;
          status?: string;
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
      customer_payment_plans: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_id: string;
          due_date: string;
          id: string;
          installments_count: number;
          status: string;
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          due_date: string;
          id?: string;
          installments_count: number;
          status?: string;
          total_amount: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          due_date?: string;
          id?: string;
          installments_count?: number;
          status?: string;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_payment_plans_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
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
      daily_cash_closings: {
        Row: {
          business_date: string;
          closed_at: string;
          closed_by: string | null;
          counted_amount: number;
          currency_code: string;
          difference: number;
          expected_amount: number;
          notes: string | null;
          opening_amount: number;
        };
        Insert: {
          business_date: string;
          closed_at?: string;
          closed_by?: string | null;
          counted_amount: number;
          currency_code: string;
          difference: number;
          expected_amount: number;
          notes?: string | null;
          opening_amount: number;
        };
        Update: {
          business_date?: string;
          closed_at?: string;
          closed_by?: string | null;
          counted_amount?: number;
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
      general_expenses: {
        Row: {
          amount: number;
          cash_transaction_id: string | null;
          category: string;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          description: string | null;
          expense_date: string;
          expense_type: string;
          id: string;
          number: number;
          operation_id: string | null;
          rate_to_yer: number;
        };
        Insert: {
          amount: number;
          cash_transaction_id?: string | null;
          category: string;
          created_at?: string;
          created_by?: string | null;
          currency_code: string;
          description?: string | null;
          expense_date?: string;
          expense_type?: string;
          id?: string;
          number?: number;
          operation_id?: string | null;
          rate_to_yer: number;
        };
        Update: {
          amount?: number;
          cash_transaction_id?: string | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          currency_code?: string;
          description?: string | null;
          expense_date?: string;
          expense_type?: string;
          id?: string;
          number?: number;
          operation_id?: string | null;
          rate_to_yer?: number;
        };
        Relationships: [
          {
            foreignKeyName: "general_expenses_cash_transaction_id_fkey";
            columns: ["cash_transaction_id"];
            isOneToOne: false;
            referencedRelation: "cash_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "general_expenses_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
        ];
      };
      home_shortcuts: {
        Row: {
          created_at: string;
          icon: string;
          id: string;
          is_visible: boolean;
          label: string;
          page_path: string;
          sort_order: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          icon?: string;
          id?: string;
          is_visible?: boolean;
          label?: string;
          page_path: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          icon?: string;
          id?: string;
          is_visible?: boolean;
          label?: string;
          page_path?: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      offline_operation_receipts: {
        Row: {
          created_at: string;
          operation_id: string;
          operation_kind: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          operation_id: string;
          operation_kind: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          operation_id?: string;
          operation_kind?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      price_categories: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          multiplier: number;
          name: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          multiplier?: number;
          name: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          multiplier?: number;
          name?: string;
        };
        Relationships: [];
      };
      print_settings: {
        Row: {
          accent_color: string;
          copies: number;
          created_at: string;
          document_type: string;
          font_family: string;
          font_size: number;
          footer_text: string | null;
          id: string;
          margin_bottom: number;
          margin_left: number;
          margin_right: number;
          margin_top: number;
          orientation: string;
          paper_size: string;
          primary_color: string;
          printer_type: string | null;
          secondary_color: string;
          show_barcode: boolean;
          show_customer_info: boolean;
          show_date_time: boolean;
          show_discount: boolean;
          show_footer: boolean;
          show_items_table: boolean;
          show_logo: boolean;
          show_payment_method: boolean;
          show_qr_code: boolean;
          show_shop_address: boolean;
          show_shop_name: boolean;
          show_shop_phone: boolean;
          show_tax: boolean;
          show_totals: boolean;
          updated_at: string;
        };
        Insert: {
          accent_color?: string;
          copies?: number;
          created_at?: string;
          document_type?: string;
          font_family?: string;
          font_size?: number;
          footer_text?: string | null;
          id?: string;
          margin_bottom?: number;
          margin_left?: number;
          margin_right?: number;
          margin_top?: number;
          orientation?: string;
          paper_size?: string;
          primary_color?: string;
          printer_type?: string | null;
          secondary_color?: string;
          show_barcode?: boolean;
          show_customer_info?: boolean;
          show_date_time?: boolean;
          show_discount?: boolean;
          show_footer?: boolean;
          show_items_table?: boolean;
          show_logo?: boolean;
          show_payment_method?: boolean;
          show_qr_code?: boolean;
          show_shop_address?: boolean;
          show_shop_name?: boolean;
          show_shop_phone?: boolean;
          show_tax?: boolean;
          show_totals?: boolean;
          updated_at?: string;
        };
        Update: {
          accent_color?: string;
          copies?: number;
          created_at?: string;
          document_type?: string;
          font_family?: string;
          font_size?: number;
          footer_text?: string | null;
          id?: string;
          margin_bottom?: number;
          margin_left?: number;
          margin_right?: number;
          margin_top?: number;
          orientation?: string;
          paper_size?: string;
          primary_color?: string;
          printer_type?: string | null;
          secondary_color?: string;
          show_barcode?: boolean;
          show_customer_info?: boolean;
          show_date_time?: boolean;
          show_discount?: boolean;
          show_footer?: boolean;
          show_items_table?: boolean;
          show_logo?: boolean;
          show_payment_method?: boolean;
          show_qr_code?: boolean;
          show_shop_address?: boolean;
          show_shop_name?: boolean;
          show_shop_phone?: boolean;
          show_tax?: boolean;
          show_totals?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_free_prices: {
        Row: {
          default_price: number;
          free_price: number;
          price_category_id: string;
          price_difference: number;
          product_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          default_price: number;
          free_price: number;
          price_category_id: string;
          price_difference?: number;
          product_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          default_price?: number;
          free_price?: number;
          price_category_id?: string;
          price_difference?: number;
          product_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_free_prices_price_category_id_fkey";
            columns: ["price_category_id"];
            isOneToOne: false;
            referencedRelation: "price_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_free_prices_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_suppliers: {
        Row: {
          is_primary: boolean;
          last_cost: number;
          priority: number;
          product_id: string;
          supplier_id: string;
          supplier_sku: string | null;
          updated_at: string;
        };
        Insert: {
          is_primary?: boolean;
          last_cost?: number;
          priority?: number;
          product_id: string;
          supplier_id: string;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Update: {
          is_primary?: boolean;
          last_cost?: number;
          priority?: number;
          product_id?: string;
          supplier_id?: string;
          supplier_sku?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_suppliers_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      product_units: {
        Row: {
          created_at: string;
          factor: number;
          is_base: boolean;
          product_id: string;
          sort_order: number;
          unit_name: string;
        };
        Insert: {
          created_at?: string;
          factor?: number;
          is_base?: boolean;
          product_id: string;
          sort_order?: number;
          unit_name: string;
        };
        Update: {
          created_at?: string;
          factor?: number;
          is_base?: boolean;
          product_id?: string;
          sort_order?: number;
          unit_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_units_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
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
      purchase_invoices: {
        Row: {
          created_at: string;
          id: string;
          number: number;
          operation_id: string | null;
          supplier: string | null;
          total: number;
          user_id: string | null;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          number?: number;
          operation_id?: string | null;
          supplier?: string | null;
          total?: number;
          user_id?: string | null;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          number?: number;
          operation_id?: string | null;
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
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: "purchase_orders_purchase_invoice_id_fkey";
            columns: ["purchase_invoice_id"];
            isOneToOne: false;
            referencedRelation: "purchase_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
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
      rep_commissions: {
        Row: {
          commission_amount: number;
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          paid: boolean;
          paid_at: string | null;
          paid_by: string | null;
          period_month: string;
          rep_id: string;
          sale_invoice_id: string | null;
        };
        Insert: {
          commission_amount: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          paid?: boolean;
          paid_at?: string | null;
          paid_by?: string | null;
          period_month?: string;
          rep_id: string;
          sale_invoice_id?: string | null;
        };
        Update: {
          commission_amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          paid?: boolean;
          paid_at?: string | null;
          paid_by?: string | null;
          period_month?: string;
          rep_id?: string;
          sale_invoice_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "rep_commissions_rep_id_fkey";
            columns: ["rep_id"];
            isOneToOne: false;
            referencedRelation: "sales_representatives";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rep_commissions_sale_invoice_id_fkey";
            columns: ["sale_invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_defaults: {
        Row: {
          auto_print_receipt: boolean;
          created_at: string;
          default_currency_code: string;
          default_discount: number;
          default_payment_method: string;
          default_tax: number;
          default_tier: string;
          id: string;
          page_type: string;
          print_printer_type: string | null;
          updated_at: string;
        };
        Insert: {
          auto_print_receipt?: boolean;
          created_at?: string;
          default_currency_code?: string;
          default_discount?: number;
          default_payment_method?: string;
          default_tax?: number;
          default_tier?: string;
          id?: string;
          page_type?: string;
          print_printer_type?: string | null;
          updated_at?: string;
        };
        Update: {
          auto_print_receipt?: boolean;
          created_at?: string;
          default_currency_code?: string;
          default_discount?: number;
          default_payment_method?: string;
          default_tax?: number;
          default_tier?: string;
          id?: string;
          page_type?: string;
          print_printer_type?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_defaults_default_currency_code_fkey";
            columns: ["default_currency_code"];
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
      sales_representatives: {
        Row: {
          active: boolean;
          code: number;
          commission_rate: number;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code?: number;
          commission_rate?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: number;
          commission_rate?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales_return_items: {
        Row: {
          condition: string;
          disposition: string;
          id: string;
          product_id: string;
          quantity: number;
          return_id: string;
          total_yer: number;
          unit_price_yer: number;
        };
        Insert: {
          condition?: string;
          disposition?: string;
          id?: string;
          product_id: string;
          quantity: number;
          return_id: string;
          total_yer: number;
          unit_price_yer: number;
        };
        Update: {
          condition?: string;
          disposition?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          return_id?: string;
          total_yer?: number;
          unit_price_yer?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_return_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_return_items_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "sales_returns";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_returns: {
        Row: {
          affects_drawer: boolean;
          created_at: string;
          created_by: string | null;
          currency_code: string;
          customer_id: string | null;
          customer_name: string | null;
          exchange_rate_to_yer: number;
          id: string;
          invoice_id: string | null;
          notes: string | null;
          number: number;
          operation_id: string;
          payment_method: string;
          posted_at: string | null;
          refund_kind: string;
          status: string;
          subtotal_yer: number;
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
          exchange_rate_to_yer: number;
          id?: string;
          invoice_id?: string | null;
          notes?: string | null;
          number?: number;
          operation_id: string;
          payment_method?: string;
          posted_at?: string | null;
          refund_kind?: string;
          status?: string;
          subtotal_yer?: number;
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
          exchange_rate_to_yer?: number;
          id?: string;
          invoice_id?: string | null;
          notes?: string | null;
          number?: number;
          operation_id?: string;
          payment_method?: string;
          posted_at?: string | null;
          refund_kind?: string;
          status?: string;
          subtotal_yer?: number;
          total_yer?: number;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_returns_currency_code_fkey";
            columns: ["currency_code"];
            isOneToOne: false;
            referencedRelation: "currencies";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "sales_returns_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_returns_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "sales_invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_returns_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      scanner_settings: {
        Row: {
          auto_execute: boolean;
          beep_on_scan: boolean;
          created_at: string;
          id: string;
          page_path: string;
          scanner_action: string;
          target_page: string | null;
          updated_at: string;
          vibrate_on_scan: boolean;
        };
        Insert: {
          auto_execute?: boolean;
          beep_on_scan?: boolean;
          created_at?: string;
          id?: string;
          page_path: string;
          scanner_action?: string;
          target_page?: string | null;
          updated_at?: string;
          vibrate_on_scan?: boolean;
        };
        Update: {
          auto_execute?: boolean;
          beep_on_scan?: boolean;
          created_at?: string;
          id?: string;
          page_path?: string;
          scanner_action?: string;
          target_page?: string | null;
          updated_at?: string;
          vibrate_on_scan?: boolean;
        };
        Relationships: [];
      };
      share_settings: {
        Row: {
          auto_share: boolean;
          created_at: string;
          default_message: string | null;
          document_type: string;
          id: string;
          require_confirmation: boolean;
          share_methods: Json;
          updated_at: string;
        };
        Insert: {
          auto_share?: boolean;
          created_at?: string;
          default_message?: string | null;
          document_type?: string;
          id?: string;
          require_confirmation?: boolean;
          share_methods?: Json;
          updated_at?: string;
        };
        Update: {
          auto_share?: boolean;
          created_at?: string;
          default_message?: string | null;
          document_type?: string;
          id?: string;
          require_confirmation?: boolean;
          share_methods?: Json;
          updated_at?: string;
        };
        Relationships: [];
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
      supplier_return_items: {
        Row: {
          id: string;
          product_id: string;
          quantity: number;
          supplier_return_id: string;
          unit_cost: number;
        };
        Insert: {
          id?: string;
          product_id: string;
          quantity: number;
          supplier_return_id: string;
          unit_cost: number;
        };
        Update: {
          id?: string;
          product_id?: string;
          quantity?: number;
          supplier_return_id?: string;
          unit_cost?: number;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_return_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_return_items_supplier_return_id_fkey";
            columns: ["supplier_return_id"];
            isOneToOne: false;
            referencedRelation: "supplier_returns";
            referencedColumns: ["id"];
          },
        ];
      };
      supplier_returns: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          notes: string | null;
          number: number;
          return_id: string | null;
          status: string;
          supplier_id: string;
          total_cost: number;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          number?: number;
          return_id?: string | null;
          status?: string;
          supplier_id: string;
          total_cost?: number;
          warehouse_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          notes?: string | null;
          number?: number;
          return_id?: string | null;
          status?: string;
          supplier_id?: string;
          total_cost?: number;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "supplier_returns_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "sales_returns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_returns_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "supplier_returns_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
        ];
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
          po_method: string;
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
          po_method?: string;
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
          po_method?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_activity_log: {
        Row: {
          action: string;
          created_at: string;
          details: Json | null;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          user_id: string | null;
          username: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          user_id?: string | null;
          username?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          details?: Json | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          user_id?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
      system_timezone: {
        Row: {
          auto_detect: boolean;
          created_at: string;
          date_format: string;
          id: number;
          time_format: string;
          timezone: string;
          updated_at: string;
          use_24h_format: boolean;
        };
        Insert: {
          auto_detect?: boolean;
          created_at?: string;
          date_format?: string;
          id?: number;
          time_format?: string;
          timezone?: string;
          updated_at?: string;
          use_24h_format?: boolean;
        };
        Update: {
          auto_detect?: boolean;
          created_at?: string;
          date_format?: string;
          id?: number;
          time_format?: string;
          timezone?: string;
          updated_at?: string;
          use_24h_format?: boolean;
        };
        Relationships: [];
      };
      ui_theme_settings: {
        Row: {
          accent_color: string;
          compact_mode: boolean;
          created_at: string;
          font_family: string;
          font_size: string;
          id: string;
          language: string;
          notification_enabled: boolean;
          notification_importance: string;
          notification_sound: boolean;
          notification_vibrate: boolean;
          primary_color: string;
          rtl_layout: boolean;
          secondary_color: string;
          show_animations: boolean;
          show_avatars: boolean;
          theme_mode: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          accent_color?: string;
          compact_mode?: boolean;
          created_at?: string;
          font_family?: string;
          font_size?: string;
          id?: string;
          language?: string;
          notification_enabled?: boolean;
          notification_importance?: string;
          notification_sound?: boolean;
          notification_vibrate?: boolean;
          primary_color?: string;
          rtl_layout?: boolean;
          secondary_color?: string;
          show_animations?: boolean;
          show_avatars?: boolean;
          theme_mode?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          accent_color?: string;
          compact_mode?: boolean;
          created_at?: string;
          font_family?: string;
          font_size?: string;
          id?: string;
          language?: string;
          notification_enabled?: boolean;
          notification_importance?: string;
          notification_sound?: boolean;
          notification_vibrate?: boolean;
          primary_color?: string;
          rtl_layout?: boolean;
          secondary_color?: string;
          show_animations?: boolean;
          show_avatars?: boolean;
          theme_mode?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
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
      vehicles: {
        Row: {
          created_at: string;
          driver_name: string | null;
          id: string;
          model: string;
          plate_number: string;
        };
        Insert: {
          created_at?: string;
          driver_name?: string | null;
          id?: string;
          model: string;
          plate_number: string;
        };
        Update: {
          created_at?: string;
          driver_name?: string | null;
          id?: string;
          model?: string;
          plate_number?: string;
        };
        Relationships: [];
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
      add_home_shortcut: {
        Args: {
          _icon: string;
          _is_visible: boolean;
          _label: string;
          _page_path: string;
          _sort_order: number;
        };
        Returns: string;
      };
      admin_purge: {
        Args: { _scope: string; _warehouse?: string };
        Returns: undefined;
      };
      archive_customer: { Args: { _id: string }; Returns: undefined };
      archive_supplier: { Args: { _id: string }; Returns: undefined };
      calculate_rep_commission: {
        Args: { _rep_id: string; _sale_invoice_id: string };
        Returns: string;
      };
      can_manage_stock: { Args: { _user_id: string }; Returns: boolean };
      close_cash_shift: {
        Args: { _counts: Json; _id: string; _notes?: string };
        Returns: undefined;
      };
      close_daily_cash: {
        Args: { _business_date: string; _counts: Json; _notes?: string };
        Returns: undefined;
      };
      close_daily_cash_offline: {
        Args: {
          _business_date: string;
          _counts: Json;
          _notes: string;
          _operation_id: string;
        };
        Returns: undefined;
      };
      ean13: { Args: { _d12: string }; Returns: string };
      employee_can: {
        Args: { _key: string; _kind: string; _user_id: string };
        Returns: boolean;
      };
      generate_purchase_orders: { Args: never; Returns: Json };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      log_system_activity: {
        Args: {
          _action: string;
          _details?: Json;
          _entity_id?: string;
          _entity_type?: string;
        };
        Returns: undefined;
      };
      open_cash_shift: { Args: { _opening?: Json }; Returns: string };
      pay_rep_commission: {
        Args: { _commission_id: string; _payment_method: string };
        Returns: undefined;
      };
      post_purchase: {
        Args: { _items: Json; _supplier: string; _warehouse: string };
        Returns: string;
      };
      post_purchase_offline: {
        Args: {
          _items: Json;
          _operation_id: string;
          _supplier: string;
          _warehouse: string;
        };
        Returns: string;
      };
      post_return: {
        Args: {
          _currency_code: string;
          _customer_id: string;
          _customer_name: string;
          _invoice_id: string;
          _items: Json;
          _notes: string;
          _operation_id: string;
          _payment_method: string;
          _rate_to_yer: number;
          _refund_kind: string;
          _warehouse: string;
        };
        Returns: string;
      };
      post_return_offline: {
        Args: {
          _currency_code: string;
          _customer_id: string;
          _customer_name: string;
          _invoice_id: string;
          _items: Json;
          _notes: string;
          _operation_id: string;
          _payment_method: string;
          _rate_to_yer: number;
          _refund_kind: string;
          _warehouse: string;
        };
        Returns: string;
      };
      post_sale: { Args: { _id: string }; Returns: undefined };
      post_sale_offline: {
        Args: { _id: string; _operation_id: string };
        Returns: undefined;
      };
      post_voucher: { Args: { _id: string }; Returns: undefined };
      post_voucher_offline: {
        Args: { _id: string; _operation_id: string };
        Returns: undefined;
      };
      receive_purchase_order: { Args: { _id: string }; Returns: string };
      receive_reorder: { Args: { _id: string }; Returns: undefined };
      record_general_expense: {
        Args: {
          _amount: number;
          _category: string;
          _currency_code: string;
          _description: string;
          _expense_date: string;
          _expense_type: string;
          _payment_method: string;
          _rate_to_yer: number;
        };
        Returns: string;
      };
      record_general_expense_offline: {
        Args: {
          _amount: number;
          _category: string;
          _currency_code: string;
          _description: string;
          _expense_date: string;
          _expense_type: string;
          _operation_id: string;
          _payment_method: string;
          _rate_to_yer: number;
        };
        Returns: string;
      };
      refresh_payment_plan_statuses: { Args: never; Returns: undefined };
      remove_home_shortcut: { Args: { _id: string }; Returns: undefined };
      save_barcode_label_settings: {
        Args: {
          _custom_price: number;
          _label_height_mm: number;
          _label_width_mm: number;
          _labels_per_page: number;
          _price_category: string;
          _price_source: string;
          _printer_type: string;
          _product_name_field: string;
          _shop_name: string;
          _show_barcode_image: boolean;
          _show_logo: boolean;
          _show_qr_code: boolean;
          _title: string;
        };
        Returns: undefined;
      };
      save_catalog_setting_offline: {
        Args: {
          _id: string;
          _operation_id: string;
          _record: Json;
          _table: string;
        };
        Returns: string;
      };
      save_customer: {
        Args: {
          _address: string;
          _credit_limit_yer: number;
          _customer_type: string;
          _id: string;
          _inactive_alert_enabled: boolean;
          _name: string;
          _phone: string;
          _secondary_phone: string;
        };
        Returns: string;
      };
      save_customer_offline: {
        Args: {
          _address: string;
          _credit_limit_yer: number;
          _customer_type: string;
          _id: string;
          _inactive_alert_enabled: boolean;
          _name: string;
          _operation_id: string;
          _phone: string;
          _secondary_phone: string;
        };
        Returns: string;
      };
      save_payment_plan: {
        Args: {
          _customer_id: string;
          _due_date: string;
          _id: string;
          _installments_count: number;
          _total_amount_yer: number;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          customer_id: string;
          due_date: string;
          id: string;
          installments_count: number;
          status: string;
          total_amount: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "customer_payment_plans";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      save_print_settings: {
        Args: {
          _accent_color: string;
          _copies: number;
          _document_type: string;
          _font_family: string;
          _font_size: number;
          _footer_text: string;
          _margin_bottom: number;
          _margin_left: number;
          _margin_right: number;
          _margin_top: number;
          _orientation: string;
          _paper_size: string;
          _primary_color: string;
          _printer_type: string;
          _secondary_color: string;
          _show_barcode: boolean;
          _show_customer_info: boolean;
          _show_date_time: boolean;
          _show_discount: boolean;
          _show_footer: boolean;
          _show_items_table: boolean;
          _show_logo: boolean;
          _show_payment_method: boolean;
          _show_qr_code: boolean;
          _show_shop_address: boolean;
          _show_shop_name: boolean;
          _show_shop_phone: boolean;
          _show_tax: boolean;
          _show_totals: boolean;
        };
        Returns: undefined;
      };
      save_product_attributes: {
        Args: { _attributes: Json; _product: string };
        Returns: undefined;
      };
      save_product_offline: {
        Args: {
          _attributes: Json;
          _balances: Json;
          _id: string;
          _operation_id: string;
          _product: Json;
        };
        Returns: string;
      };
      save_product_opening_balances: {
        Args: { _balances: Json; _product: string };
        Returns: undefined;
      };
      save_product_opening_balances_offline: {
        Args: { _balances: Json; _operation_id: string; _product: string };
        Returns: undefined;
      };
      save_product_supplier: {
        Args: {
          _is_primary: boolean;
          _last_cost: number;
          _product_id: string;
          _supplier_id: string;
          _supplier_sku: string;
        };
        Returns: undefined;
      };
      save_product_supplier_offline: {
        Args: {
          _is_primary: boolean;
          _last_cost: number;
          _operation_id: string;
          _product_id: string;
          _supplier_id: string;
          _supplier_sku: string;
        };
        Returns: undefined;
      };
      save_product_suppliers: {
        Args: { _items: Json; _product: string };
        Returns: undefined;
      };
      save_product_suppliers_offline: {
        Args: { _items: Json; _operation_id: string; _product: string };
        Returns: undefined;
      };
      save_product_units: {
        Args: { _product: string; _units: Json };
        Returns: undefined;
      };
      save_product_units_offline: {
        Args: { _operation_id: string; _product: string; _units: Json };
        Returns: undefined;
      };
      save_purchase_order_draft: {
        Args: {
          _id: string;
          _items: Json;
          _notes: string;
          _supplier_id: string;
          _warehouse: string;
        };
        Returns: string;
      };
      save_purchase_order_draft_offline: {
        Args: {
          _id: string;
          _items: Json;
          _notes: string;
          _supplier_id: string;
          _warehouse: string;
        };
        Returns: string;
      };
      save_sale_draft: {
        Args: {
          _affects_drawer: boolean;
          _currency_code: string;
          _customer_id: string;
          _customer_name: string;
          _discount_yer: number;
          _id: string;
          _items: Json;
          _notes: string;
          _paid_amount: number;
          _payment_method: string;
          _rate_to_yer: number;
          _tax_yer: number;
          _warehouse: string;
        };
        Returns: string;
      };
      save_sale_draft_offline: {
        Args: {
          _affects_drawer: boolean;
          _currency_code: string;
          _customer_id: string;
          _customer_name: string;
          _discount_yer: number;
          _id: string;
          _items: Json;
          _notes: string;
          _paid_amount: number;
          _payment_method: string;
          _rate_to_yer: number;
          _tax_yer: number;
          _warehouse: string;
        };
        Returns: string;
      };
      save_sales_defaults: {
        Args: {
          _auto_print_receipt: boolean;
          _default_currency_code: string;
          _default_discount: number;
          _default_payment_method: string;
          _default_tax: number;
          _default_tier: string;
          _page_type: string;
          _print_printer_type: string;
        };
        Returns: undefined;
      };
      save_sales_representative: {
        Args: {
          _active: boolean;
          _commission_rate: number;
          _id?: string;
          _name: string;
          _phone: string;
        };
        Returns: string;
      };
      save_scanner_settings: {
        Args: {
          _auto_execute: boolean;
          _beep_on_scan: boolean;
          _page_path: string;
          _scanner_action: string;
          _target_page: string;
          _vibrate_on_scan: boolean;
        };
        Returns: undefined;
      };
      save_share_settings: {
        Args: {
          _auto_share: boolean;
          _default_message: string;
          _document_type: string;
          _require_confirmation: boolean;
          _share_methods: Json;
        };
        Returns: undefined;
      };
      save_supplier: {
        Args: {
          _address: string;
          _id: string;
          _name: string;
          _notes: string;
          _phone: string;
        };
        Returns: string;
      };
      save_supplier_offline: {
        Args: {
          _address: string;
          _id: string;
          _name: string;
          _notes: string;
          _operation_id: string;
          _phone: string;
        };
        Returns: string;
      };
      save_system_timezone: {
        Args: {
          _auto_detect: boolean;
          _date_format: string;
          _time_format: string;
          _timezone: string;
          _use_24h_format: boolean;
        };
        Returns: undefined;
      };
      save_ui_theme_settings: {
        Args: {
          _accent_color: string;
          _compact_mode: boolean;
          _font_family: string;
          _font_size: string;
          _language: string;
          _notification_enabled: boolean;
          _notification_importance: string;
          _notification_sound: boolean;
          _notification_vibrate: boolean;
          _primary_color: string;
          _rtl_layout: boolean;
          _secondary_color: string;
          _show_animations: boolean;
          _show_avatars: boolean;
          _theme_mode: string;
        };
        Returns: undefined;
      };
      save_voucher_draft: {
        Args: {
          _affects_drawer: boolean;
          _amount: number;
          _category: string;
          _currency_code: string;
          _customer_id: string;
          _id: string;
          _kind: string;
          _notes: string;
          _payee: string;
          _payment_method: string;
          _rate_to_yer: number;
        };
        Returns: string;
      };
      save_voucher_draft_offline: {
        Args: {
          _affects_drawer: boolean;
          _amount: number;
          _category: string;
          _currency_code: string;
          _customer_id: string;
          _id: string;
          _kind: string;
          _notes: string;
          _operation_id: string;
          _payee: string;
          _payment_method: string;
          _rate_to_yer: number;
        };
        Returns: string;
      };
      set_initial_stocks: {
        Args: { _balances: Json; _product: string };
        Returns: undefined;
      };
      set_product_free_price: {
        Args: {
          _free_price: number;
          _price_category_id: string;
          _product_id: string;
        };
        Returns: undefined;
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
      set_stock_batch_offline: {
        Args: {
          _items: Json;
          _kind: string;
          _operation_id: string;
          _warehouse: string;
        };
        Returns: undefined;
      };
      set_stock_offline: {
        Args: {
          _kind?: string;
          _operation_id: string;
          _product: string;
          _qty: number;
          _warehouse: string;
        };
        Returns: undefined;
      };
      set_supplier_order_method: {
        Args: { _id: string; _method: string };
        Returns: undefined;
      };
      submit_purchase_order: { Args: { _id: string }; Returns: undefined };
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
      transfer_shelf_stock_offline: {
        Args: {
          _from_shelf: string;
          _from_wh: string;
          _operation_id: string;
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
      update_home_shortcut: {
        Args: {
          _icon: string;
          _id: string;
          _is_visible: boolean;
          _label: string;
          _sort_order: number;
        };
        Returns: undefined;
      };
      update_payment_plan_status: {
        Args: { _id: string; _status: string };
        Returns: {
          created_at: string;
          created_by: string | null;
          customer_id: string;
          due_date: string;
          id: string;
          installments_count: number;
          status: string;
          total_amount: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "customer_payment_plans";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      upload_product_image_offline: {
        Args: {
          _image_data_url: string;
          _operation_id: string;
          _product_id: string;
        };
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "storekeeper", "cashier"],
    },
  },
} as const;
