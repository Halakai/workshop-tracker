export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["account_kind"];
          name: string | null;
          partner_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database["public"]["Enums"]["account_kind"];
          name?: string | null;
          partner_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["account_kind"];
          name?: string | null;
          partner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_log: {
        Row: {
          action: string;
          actor_id: string | null;
          at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
          summary: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          summary: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      allocations: {
        Row: {
          amount_cents: number;
          created_at: string;
          created_by: string | null;
          id: string;
          occurred_on: string;
          partner_id: string;
          settlement_id: string | null;
          stock_movement_id: string | null;
          transaction_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          occurred_on: string;
          partner_id: string;
          settlement_id?: string | null;
          stock_movement_id?: string | null;
          transaction_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          occurred_on?: string;
          partner_id?: string;
          settlement_id?: string | null;
          stock_movement_id?: string | null;
          transaction_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "allocations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_settlement_id_fkey";
            columns: ["settlement_id"];
            isOneToOne: false;
            referencedRelation: "settlements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_stock_movement_id_fkey";
            columns: ["stock_movement_id"];
            isOneToOne: false;
            referencedRelation: "stock_movements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "allocations_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "brands_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "brands_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      car_shares: {
        Row: {
          car_id: string;
          partner_id: string;
          share_bp: number;
        };
        Insert: {
          car_id: string;
          partner_id: string;
          share_bp: number;
        };
        Update: {
          car_id?: string;
          partner_id?: string;
          share_bp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "car_shares_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: false;
            referencedRelation: "car_summaries";
            referencedColumns: ["car_id"];
          },
          {
            foreignKeyName: "car_shares_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: false;
            referencedRelation: "cars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "car_shares_partner_id_fkey";
            columns: ["partner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cars: {
        Row: {
          asking_price_cents: number | null;
          buyer_id: string | null;
          colour: string | null;
          created_at: string;
          created_by: string | null;
          engine: string | null;
          fuel: string | null;
          id: string;
          listing_url: string | null;
          make: string;
          mileage_km: number | null;
          model: string;
          notes: string | null;
          plate: string | null;
          purchase_date: string;
          ref: string;
          sale_date: string | null;
          sale_mileage_km: number | null;
          seller_id: string | null;
          settled_at: string | null;
          status: Database["public"]["Enums"]["car_status"];
          status_changed_at: string;
          updated_at: string;
          updated_by: string | null;
          vin: string | null;
          year: number | null;
        };
        Insert: {
          asking_price_cents?: number | null;
          buyer_id?: string | null;
          colour?: string | null;
          created_at?: string;
          created_by?: string | null;
          engine?: string | null;
          fuel?: string | null;
          id?: string;
          listing_url?: string | null;
          make: string;
          mileage_km?: number | null;
          model: string;
          notes?: string | null;
          plate?: string | null;
          purchase_date?: string;
          ref: string;
          sale_date?: string | null;
          sale_mileage_km?: number | null;
          seller_id?: string | null;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["car_status"];
          status_changed_at?: string;
          updated_at?: string;
          updated_by?: string | null;
          vin?: string | null;
          year?: number | null;
        };
        Update: {
          asking_price_cents?: number | null;
          buyer_id?: string | null;
          colour?: string | null;
          created_at?: string;
          created_by?: string | null;
          engine?: string | null;
          fuel?: string | null;
          id?: string;
          listing_url?: string | null;
          make?: string;
          mileage_km?: number | null;
          model?: string;
          notes?: string | null;
          plate?: string | null;
          purchase_date?: string;
          ref?: string;
          sale_date?: string | null;
          sale_mileage_km?: number | null;
          seller_id?: string | null;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["car_status"];
          status_changed_at?: string;
          updated_at?: string;
          updated_by?: string | null;
          vin?: string | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "cars_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cars_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cars_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cars_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_categories: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_categories_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      item_categories: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "item_categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_categories_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          archived_at: string | null;
          brand_id: string | null;
          category_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          location: string | null;
          manufacturer_ref: string | null;
          min_qty: number;
          name: string;
          notes: string | null;
          part_number: string;
          qty_on_hand: number;
          stock_value_cents: number;
          unit_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          archived_at?: string | null;
          brand_id?: string | null;
          category_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string | null;
          manufacturer_ref?: string | null;
          min_qty?: number;
          name: string;
          notes?: string | null;
          part_number: string;
          qty_on_hand?: number;
          stock_value_cents?: number;
          unit_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          brand_id?: string | null;
          category_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: string | null;
          manufacturer_ref?: string | null;
          min_qty?: number;
          name?: string;
          notes?: string | null;
          part_number?: string;
          qty_on_hand?: number;
          stock_value_cents?: number;
          unit_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "items_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "item_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_share_bp: number;
          display_name: string;
          email: string;
          id: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_share_bp?: number;
          display_name: string;
          email: string;
          id: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_share_bp?: number;
          display_name?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          address: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          iban: string | null;
          id: boolean;
          invoice_footer: string | null;
          invoice_title: string;
          logo_data_url: string | null;
          phone: string | null;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
          workshop_name: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          iban?: string | null;
          id?: boolean;
          invoice_footer?: string | null;
          invoice_title?: string;
          logo_data_url?: string | null;
          phone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
          workshop_name?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          iban?: string | null;
          id?: boolean;
          invoice_footer?: string | null;
          invoice_title?: string;
          logo_data_url?: string | null;
          phone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
          workshop_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          breakdown: Json;
          car_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          payout_mode: string;
          reimburse: boolean;
          settled_on: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          breakdown?: Json;
          car_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          payout_mode: string;
          reimburse: boolean;
          settled_on?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          breakdown?: Json;
          car_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          payout_mode?: string;
          reimburse?: boolean;
          settled_on?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: true;
            referencedRelation: "car_summaries";
            referencedColumns: ["car_id"];
          },
          {
            foreignKeyName: "settlements_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: true;
            referencedRelation: "cars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          car_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          item_id: string;
          note: string | null;
          occurred_on: string;
          qty_delta: number;
          reason: string | null;
          seq: number;
          supplier: string | null;
          transaction_id: string | null;
          type: Database["public"]["Enums"]["movement_type"];
          updated_at: string;
          updated_by: string | null;
          value_delta_cents: number;
        };
        Insert: {
          car_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_id: string;
          note?: string | null;
          occurred_on?: string;
          qty_delta: number;
          reason?: string | null;
          seq?: never;
          supplier?: string | null;
          transaction_id?: string | null;
          type: Database["public"]["Enums"]["movement_type"];
          updated_at?: string;
          updated_by?: string | null;
          value_delta_cents: number;
        };
        Update: {
          car_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          item_id?: string;
          note?: string | null;
          occurred_on?: string;
          qty_delta?: number;
          reason?: string | null;
          seq?: never;
          supplier?: string | null;
          transaction_id?: string | null;
          type?: Database["public"]["Enums"]["movement_type"];
          updated_at?: string;
          updated_by?: string | null;
          value_delta_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: false;
            referencedRelation: "car_summaries";
            referencedColumns: ["car_id"];
          },
          {
            foreignKeyName: "stock_movements_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: false;
            referencedRelation: "cars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount_cents: number;
          car_id: string | null;
          category: string;
          counterparty: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string | null;
          expense_category_id: string | null;
          from_account_id: string;
          id: string;
          kind: Database["public"]["Enums"]["txn_kind"];
          occurred_on: string;
          settlement_id: string | null;
          to_account_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          amount_cents: number;
          car_id?: string | null;
          category: string;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          expense_category_id?: string | null;
          from_account_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["txn_kind"];
          occurred_on?: string;
          settlement_id?: string | null;
          to_account_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          amount_cents?: number;
          car_id?: string | null;
          category?: string;
          counterparty?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          expense_category_id?: string | null;
          from_account_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["txn_kind"];
          occurred_on?: string;
          settlement_id?: string | null;
          to_account_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: false;
            referencedRelation: "car_summaries";
            referencedColumns: ["car_id"];
          },
          {
            foreignKeyName: "transactions_car_id_fkey";
            columns: ["car_id"];
            isOneToOne: false;
            referencedRelation: "cars";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_expense_category_id_fkey";
            columns: ["expense_category_id"];
            isOneToOne: false;
            referencedRelation: "expense_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_from_account_id_fkey";
            columns: ["from_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_settlement_id_fkey";
            columns: ["settlement_id"];
            isOneToOne: false;
            referencedRelation: "settlements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_to_account_id_fkey";
            columns: ["to_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      units: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
          whole_only: boolean;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          whole_only?: boolean;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          whole_only?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "units_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "units_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      car_summaries: {
        Row: {
          car_id: string | null;
          other_costs_cents: number | null;
          parts_cents: number | null;
          purchase_cents: number | null;
          sale_cents: number | null;
          sale_count: number | null;
          stock_cents: number | null;
        };
        Relationships: [];
      };
      item_last_purchases: {
        Row: {
          item_id: string | null;
          occurred_on: string | null;
          qty: number | null;
          supplier: string | null;
          total_cents: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      admin_set_default_shares: {
        Args: { p_actor: string; p_shares: Json };
        Returns: undefined;
      };
      post_stock_movement: {
        Args: {
          p_allocations?: Json;
          p_car_id?: string;
          p_expected_version: number;
          p_item_id: string;
          p_note?: string;
          p_occurred_on?: string;
          p_paid_by?: string;
          p_qty_delta: number;
          p_reason?: string;
          p_supplier?: string;
          p_type: Database["public"]["Enums"]["movement_type"];
          p_value_delta_cents: number;
        };
        Returns: string;
      };
      record_settlement: {
        Args: {
          p_allocations: Json;
          p_breakdown?: Json;
          p_car_id: string;
          p_payout_mode: string;
          p_reimburse: boolean;
          p_settled_on: string;
          p_transfers: Json;
        };
        Returns: string;
      };
      save_workshop_money: {
        Args: {
          p_account_id: string;
          p_allocations?: Json;
          p_amount_cents: number;
          p_counterparty?: string;
          p_description?: string;
          p_expense_category_id?: string;
          p_id: string;
          p_kind: Database["public"]["Enums"]["txn_kind"];
          p_occurred_on: string;
        };
        Returns: string;
      };
      set_car_shares: {
        Args: { p_car_id: string; p_shares: Json };
        Returns: undefined;
      };
      undo_settlement: { Args: { p_car_id: string }; Returns: undefined };
      undo_stock_movement: {
        Args: { p_movement_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      account_kind: "wallet" | "partner" | "external";
      car_status:
        "bought" | "in_repair" | "ready" | "listed" | "sold" | "scrapped";
      movement_type:
        | "purchase"
        | "use_car"
        | "use_job"
        | "overhead"
        | "adjustment"
        | "return";
      txn_kind: "deposit" | "withdrawal" | "expense" | "income" | "transfer";
      user_role: "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
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
      account_kind: ["wallet", "partner", "external"],
      car_status: [
        "bought",
        "in_repair",
        "ready",
        "listed",
        "sold",
        "scrapped",
      ],
      movement_type: [
        "purchase",
        "use_car",
        "use_job",
        "overhead",
        "adjustment",
        "return",
      ],
      txn_kind: ["deposit", "withdrawal", "expense", "income", "transfer"],
      user_role: ["admin", "member"],
    },
  },
} as const;
