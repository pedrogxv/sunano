/**
 * Tipagem do schema do banco (Supabase / Postgres).
 *
 * Este arquivo contém SOMENTE tipos — nenhum código executável e nenhuma
 * credencial. É seguro importar em qualquer camada (servidor ou cliente),
 * pois tipos são apagados na compilação. As *consultas* propriamente ditas
 * vivem exclusivamente na camada de domínio (`lib/server`).
 */

/**
 * Tipos de notificação. Espelham o `check` da coluna `notifications.type`
 * (ver 20260819_notifications.sql) — mexer aqui exige mexer lá.
 */
export type NotificationType =
  | "aura_received"
  | "post_comment"
  | "comment_reply"
  | "new_follower"
  | "system"
  | "mention"

export type NotificationEntityType =
  | "forum_post"
  | "forum_comment"
  | "blog_post"
  | "blog_comment"
  | "user"

export type Database = {
  public: {
    Tables: {
      peripherals: {
        Relationships: []
        Row: {
          id: string
          name: string
          brand: string
          category: "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
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
          /** Gerado pelo trigger `sync_display_slug` — nunca enviado no Insert. */
          display_slug: string
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
          banner_url: string | null
          /** Fundo do cartão de preview rápido (Mini Perfil) e da faixa do card do diretório. */
          mini_banner_url: string | null
          /**
           * Enquadramento não-destrutivo das imagens, por chave (avatar,
           * banner, mini_banner): `{"x":0-100,"y":0-100,"zoom":1-3}`.
           * Ver `lib/profile-media-adjust.ts` e a migration 20260817.
           */
          media_adjustments: Record<string, unknown>
          bio: string | null
          account_tier: "common" | "vip" | "vip_plus"
          /** Handle sem "@" — exibido como ícone clicável no perfil público. */
          youtube_handle: string | null
          tiktok_handle: string | null
          /** Incrementado só via RPC `increment_profile_views` — nunca escrito direto. */
          profile_views: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["user_profiles"]["Row"],
          "created_at" | "updated_at" | "display_slug" | "profile_views"
        >
        Update: Partial<Database["public"]["Tables"]["user_profiles"]["Insert"]>
      }
      user_follows: {
        Relationships: []
        Row: {
          follower_id: string
          following_id: string
          created_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["user_follows"]["Row"],
          "created_at"
        >
        Update: Partial<Database["public"]["Tables"]["user_follows"]["Insert"]>
      }
      medals: {
        Relationships: []
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          icon_url: string | null
          rarity: "common" | "rare" | "epic" | "legendary"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["medals"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["medals"]["Insert"]>
      }
      user_medals: {
        Relationships: []
        Row: {
          user_id: string
          medal_id: string
          awarded_at: string
          pinned: boolean
          pinned_order: number | null
        }
        Insert: {
          user_id: string
          medal_id: string
          awarded_at?: string
          pinned?: boolean
          pinned_order?: number | null
        }
        Update: Partial<Database["public"]["Tables"]["user_medals"]["Insert"]>
      }
      events: {
        Relationships: []
        Row: {
          id: string
          slug: string
          medal_id: string
          criteria_type: "first_n_signups" | "manual_opt_in" | "aura_redeem"
          max_participants: number | null
          current_count: number
          aura_cost: number | null
          active: boolean
          start_date: string
          end_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["events"]["Row"],
          "id" | "current_count" | "created_at" | "updated_at"
        > & { current_count?: number }
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>
      }
      user_setup_items: {
        Relationships: []
        Row: {
          user_id: string
          slot: "mouse" | "keyboard" | "headset" | "monitor" | "mousepad"
          peripheral_id: string
          updated_at: string
        }
        Insert: {
          user_id: string
          slot: "mouse" | "keyboard" | "headset" | "monitor" | "mousepad"
          peripheral_id: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_setup_items"]["Insert"]>
      }
      user_favorite_peripherals: {
        Relationships: []
        Row: {
          user_id: string
          peripheral_id: string
          position: number
          created_at: string
        }
        Insert: {
          user_id: string
          peripheral_id: string
          position?: number
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_favorite_peripherals"]["Insert"]>
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
          aura_count: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["blog_posts"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["blog_posts"]["Insert"]>
      }
      blog_comments: {
        Relationships: []
        Row: {
          id: string
          post_id: string
          body: string
          /** Coluna gerada (`left(body, 200)`) — nunca enviada no Insert/Update. */
          body_preview: string
          author_name: string
          user_id: string | null
          /** Aponta sempre para um comentário raiz (nunca outra resposta) — thread de 1 nível. */
          parent_comment_id: string | null
          is_hidden: boolean
          aura_count: number
          /** Até 2 URLs do bucket `comments` — limite também travado por CHECK no banco. */
          image_urls: string[]
          /** Até 2 ids de usuário @mencionados — dispara notificação tipo `mention`. */
          mentioned_user_ids: string[]
          /** Última edição do texto pelo autor (janela de 15min). Null = nunca editado. */
          edited_at: string | null
          /** Coluna gerada (`edited_at is not null`) — nunca enviada no Insert/Update. */
          is_edited: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["blog_comments"]["Row"],
          "id" | "body_preview" | "is_edited" | "edited_at" | "created_at" | "updated_at"
        > & { edited_at?: string | null }
        Update: Partial<Database["public"]["Tables"]["blog_comments"]["Insert"]>
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
          body: string | null
          /** Coluna gerada (`left(coalesce(body, title), 280)`) — nunca enviada no Insert/Update. */
          body_preview: string
          author_name: string
          user_id: string | null
          category_id: string
          media_image_urls: string[]
          media_video_url: string | null
          is_hidden: boolean
          is_locked: boolean
          is_pinned: boolean
          aura_count: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["forum_posts"]["Row"],
          "id" | "body_preview" | "created_at" | "updated_at"
        >
        Update: Partial<Database["public"]["Tables"]["forum_posts"]["Insert"]>
      }
      forum_comments: {
        Relationships: []
        Row: {
          id: string
          post_id: string
          body: string
          /** Coluna gerada (`left(body, 200)`) — nunca enviada no Insert/Update. */
          body_preview: string
          author_name: string
          user_id: string | null
          /** Aponta sempre para um comentário raiz (nunca outra resposta) — thread de 1 nível. */
          parent_comment_id: string | null
          is_hidden: boolean
          aura_count: number
          /** Até 2 URLs do bucket `comments` — limite também travado por CHECK no banco. */
          image_urls: string[]
          /** Até 2 ids de usuário @mencionados — dispara notificação tipo `mention`. */
          mentioned_user_ids: string[]
          /** Última edição do texto pelo autor (janela de 15min). Null = nunca editado. */
          edited_at: string | null
          /** Coluna gerada (`edited_at is not null`) — nunca enviada no Insert/Update. */
          is_edited: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["forum_comments"]["Row"],
          "id" | "body_preview" | "is_edited" | "edited_at" | "created_at" | "updated_at"
        > & { edited_at?: string | null }
        Update: Partial<Database["public"]["Tables"]["forum_comments"]["Insert"]>
      }
      forum_reports: {
        Relationships: []
        Row: {
          id: string
          target_type: "post" | "comment"
          /** Post denunciado, ou post-pai do comentário denunciado — sempre presente. */
          post_id: string
          comment_id: string | null
          reporter_user_id: string
          status: "pending" | "reviewed" | "dismissed"
          created_at: string
          reviewed_at: string | null
        }
        Insert: Omit<
          Database["public"]["Tables"]["forum_reports"]["Row"],
          "id" | "status" | "created_at" | "reviewed_at"
        >
        Update: Partial<Database["public"]["Tables"]["forum_reports"]["Insert"]> & {
          status?: "pending" | "reviewed" | "dismissed"
          reviewed_at?: string | null
        }
      }
      forum_categories: {
        Relationships: []
        Row: {
          id: string
          parent_id: string | null
          slug: string
          name: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["forum_categories"]["Row"],
          "id" | "sort_order" | "is_active" | "created_at" | "updated_at"
        > &
          Partial<Pick<Database["public"]["Tables"]["forum_categories"]["Row"], "sort_order" | "is_active">>
        Update: Partial<Database["public"]["Tables"]["forum_categories"]["Insert"]>
      }
      forum_aura: {
        Relationships: []
        Row: {
          id: string
          giver_id: string
          post_id: string | null
          comment_id: string | null
          blog_post_id: string | null
          blog_comment_id: string | null
          kind: "like" | "dislike"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["forum_aura"]["Row"], "id" | "created_at" | "kind"> &
          Partial<Pick<Database["public"]["Tables"]["forum_aura"]["Row"], "kind">>
        Update: Partial<Database["public"]["Tables"]["forum_aura"]["Insert"]>
      }
      user_aura_wallet: {
        Relationships: []
        Row: {
          user_id: string
          balance: number
          updated_at: string
        }
        Insert: Database["public"]["Tables"]["user_aura_wallet"]["Row"]
        Update: Partial<Database["public"]["Tables"]["user_aura_wallet"]["Insert"]>
      }
      aura_ledger: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          delta: number
          reason:
            | "post_aura_received"
            | "post_aura_removed"
            | "comment_aura_received"
            | "comment_aura_removed"
            | "event_medal_redeemed"
            | "blog_post_aura_received"
            | "blog_post_aura_removed"
            | "blog_comment_aura_received"
            | "blog_comment_aura_removed"
            | "post_aura_disliked"
            | "post_aura_undisliked"
            | "comment_aura_disliked"
            | "comment_aura_undisliked"
            | "blog_post_aura_disliked"
            | "blog_post_aura_undisliked"
            | "blog_comment_aura_disliked"
            | "blog_comment_aura_undisliked"
            | "post_created"
            | "comment_created"
            | "blog_comment_created"
          source_post_id: string | null
          source_comment_id: string | null
          source_blog_post_id: string | null
          source_blog_comment_id: string | null
          giver_id: string | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["aura_ledger"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["aura_ledger"]["Insert"]>
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
      mfa_trusted_devices: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          token_hash: string
          user_agent: string | null
          created_at: string
          expires_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["mfa_trusted_devices"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["mfa_trusted_devices"]["Insert"]>
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
      tierlist_meta: {
        Relationships: []
        Row: {
          id: number
          latest_update_month: string
          latest_update_description: string
          updated_at: string
        }
        Insert: {
          id?: number
          latest_update_month: string
          latest_update_description: string
          updated_at?: string
        }
        Update: {
          id?: number
          latest_update_month?: string
          latest_update_description?: string
          updated_at?: string
        }
      }
      home_banners: {
        Relationships: []
        Row: {
          id: string
          image_url: string
          image_url_mobile: string | null
          link_url: string | null
          alt_text: string | null
          sort_order: number
          is_active: boolean
          starts_at: string | null
          ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          image_url: string
          image_url_mobile?: string | null
          link_url?: string | null
          alt_text?: string | null
          sort_order?: number
          is_active?: boolean
          starts_at?: string | null
          ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          image_url?: string
          image_url_mobile?: string | null
          link_url?: string | null
          alt_text?: string | null
          sort_order?: number
          is_active?: boolean
          starts_at?: string | null
          ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      notifications: {
        Relationships: []
        Row: {
          id: string
          /** Destinatário do aviso — nunca quem o causou (esse é `actor_id`). */
          user_id: string
          type: NotificationType
          actor_id: string | null
          actor_name: string | null
          entity_type: NotificationEntityType | null
          entity_id: string | null
          link: string | null
          title: string | null
          body: string | null
          amount: number | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: NotificationType
          actor_id?: string | null
          actor_name?: string | null
          entity_type?: NotificationEntityType | null
          entity_id?: string | null
          link?: string | null
          title?: string | null
          body?: string | null
          amount?: number | null
          is_read?: boolean
          created_at?: string
        }
        Update: { is_read?: boolean }
      }
    }
    Views: Record<string, never>
    Functions: {
      broadcast_system_notification: {
        Args: { p_title: string; p_body: string; p_link?: string | null; p_user_id?: string | null }
        Returns: number
      }
      decrement_store_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: boolean
      }
      anonymize_user_data: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      add_favorite_peripheral: {
        Args: { p_user_id: string; p_peripheral_id: string; p_limit: number }
        Returns: "liked" | "already_liked" | "limit_reached"
      }
      increment_profile_views: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      claim_event_medal: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: boolean
      }
      toggle_forum_aura: {
        Args: {
          p_giver_id: string
          p_target_type: "post" | "comment" | "blog_post" | "blog_comment"
          p_target_id: string
          p_kind?: "like" | "dislike"
        }
        Returns: { reaction: "like" | "dislike" | null; aura_count: number }[]
      }
      toggle_forum_post_aura: {
        Args: { p_giver_id: string; p_post_id: string }
        Returns: { reaction: "like" | "dislike" | null; aura_count: number }[]
      }
      credit_forum_post_creation_aura: {
        Args: { p_user_id: string; p_post_id: string }
        Returns: boolean
      }
      credit_comment_creation_aura: {
        Args: { p_user_id: string; p_target_type: "post" | "blog_post"; p_target_id: string }
        Returns: boolean
      }
    }
  }
}
