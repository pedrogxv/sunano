/**
 * Tipagem do schema do banco (Supabase / Postgres).
 *
 * Este arquivo contém SOMENTE tipos — nenhum código executável e nenhuma
 * credencial. É seguro importar em qualquer camada (servidor ou cliente),
 * pois tipos são apagados na compilação. As *consultas* propriamente ditas
 * vivem exclusivamente na camada de domínio (`lib/server`).
 */

export type Database = {
  public: {
    Tables: {
      peripherals: {
        Relationships: []
        Row: {
          id: string
          name: string
          brand: string
          category: "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
          tier: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
          price: number
          image_url: string | null
          created_at: string
          updated_at: string
          specs: Record<string, unknown>
          tags: ("competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "magnetico")[]
        }
        Insert: Omit<Database["public"]["Tables"]["peripherals"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["peripherals"]["Insert"]>
      }
      user_profiles: {
        Relationships: []
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          full_name: string | null
          cpf: string | null
          phone: string | null
          postal_code: string | null
          street: string | null
          number: string | null
          complement: string | null
          neighborhood: string | null
          city: string | null
          state: string | null
          theme: string | null
          locale: string | null
          lgpd_consent_at: string | null
          lgpd_consent_version: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["user_profiles"]["Row"], "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["user_profiles"]["Insert"]>
      }
      audit_log: {
        Relationships: []
        Row: {
          id: string
          user_id: string | null
          actor_id: string | null
          action: string
          table_name: string | null
          record_id: string | null
          metadata: Record<string, unknown>
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          actor_id?: string | null
          action: string
          table_name?: string | null
          record_id?: string | null
          metadata?: Record<string, unknown>
          ip_address?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>
      }
      blog_posts: {
        Relationships: []
        Row: {
          id: string
          peripheral_id: string
          author_id: string | null
          title: string
          slug: string
          excerpt: string | null
          cover_image_url: string | null
          cover_thumbnail_url: string | null
          read_time_minutes: number
          video_url: string | null
          content: string
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["blog_posts"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["blog_posts"]["Insert"]>
      }
      admin_profiles: {
        Relationships: []
        Row: {
          id: string
          email: string | null
          display_name: string | null
          avatar_url: string | null
          role: "admin" | "moderator" | "webmaster"
          permissions: Record<string, boolean>
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["admin_profiles"]["Row"], "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["admin_profiles"]["Insert"]>
      }
      forum_posts: {
        Relationships: []
        Row: {
          id: string
          slug: string
          title: string
          body: string
          author_name: string
          author_email: string | null
          user_id: string | null
          peripheral_refs: string[]
          is_hidden: boolean
          is_locked: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["forum_posts"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["forum_posts"]["Insert"]>
      }
      forum_comments: {
        Relationships: []
        Row: {
          id: string
          post_id: string
          body: string
          author_name: string
          author_email: string | null
          user_id: string | null
          peripheral_refs: string[]
          is_hidden: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["forum_comments"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["forum_comments"]["Insert"]>
      }
      rate_limit_events: {
        Relationships: []
        Row: {
          id: string
          action: string
          identifier: string
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["rate_limit_events"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["rate_limit_events"]["Insert"]>
      }
      offers_votes: {
        Relationships: []
        Row: {
          id: string
          offer_id: string
          voter_hash: string
          is_working: boolean
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["offers_votes"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["offers_votes"]["Insert"]>
      }
      youtube_cache_snapshots: {
        Relationships: []
        Row: {
          cache_key: string
          payload: Record<string, unknown>
          fetched_at: string
          source: string
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["youtube_cache_snapshots"]["Row"], "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["youtube_cache_snapshots"]["Insert"]>
      }
      store_products: {
        Relationships: []
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          price_cents: number
          stock: number
          images: string[]
          category: string | null
          type: "store" | "bazaar"
          condition: "new" | "used" | "opened"
          condition_notes: string | null
          is_active: boolean
          peripheral_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          price_cents: number
          stock?: number
          images?: string[]
          category?: string | null
          type: "store" | "bazaar"
          condition?: "new" | "used" | "opened"
          condition_notes?: string | null
          is_active?: boolean
          peripheral_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          price_cents?: number
          stock?: number
          images?: string[]
          category?: string | null
          type?: "store" | "bazaar"
          condition?: "new" | "used" | "opened"
          condition_notes?: string | null
          is_active?: boolean
          peripheral_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      store_orders: {
        Relationships: []
        Row: {
          id: string
          stripe_session_id: string | null
          stripe_payment_intent_id: string | null
          customer_email: string | null
          customer_name: string | null
          items: Record<string, unknown>[]
          total_cents: number
          status: "pending" | "paid" | "cancelled" | "refunded"
          payment_method: string | null
          metadata: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stripe_session_id?: string | null
          stripe_payment_intent_id?: string | null
          customer_email?: string | null
          customer_name?: string | null
          items: Record<string, unknown>[]
          total_cents: number
          status?: "pending" | "paid" | "cancelled" | "refunded"
          payment_method?: string | null
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          stripe_session_id?: string | null
          stripe_payment_intent_id?: string | null
          customer_email?: string | null
          customer_name?: string | null
          items?: Record<string, unknown>[]
          total_cents?: number
          status?: "pending" | "paid" | "cancelled" | "refunded"
          payment_method?: string | null
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      decrement_store_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      anonymize_user_data: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
  }
}
