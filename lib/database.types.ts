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
  | "new_post"
  | "order_status"
  | "support_reply"
  | "support_new_ticket"
  | "support_user_reply"
  | "support_status"

export type NotificationEntityType =
  | "forum_post"
  | "forum_comment"
  | "blog_post"
  | "blog_comment"
  | "user"
  | "order"
  | "support_ticket"

export type Database = {
  public: {
    Tables: {
      peripherals: {
        Relationships: []
        Row: {
          id: string
          name: string
          brand_id: string
          category: "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
          tier: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
          price: number
          image_url: string | null
          created_at: string
          updated_at: string
          specs: Record<string, unknown>
          /** Sem CHECK constraint no banco — valores válidos vivem em lib/tag-options.ts. */
          tags: string[]
          /**
           * Campos extraídos de `specs` para colunas reais indexáveis (ver
           * migration 20260917000001_peripherals_columns_and_indexes.sql).
           * Sem CHECK/enum ainda — mesma justificativa de `tags` acima.
           * `specs` continua sendo gravado em paralelo (dual-write) até os
           * consumidores migrarem por completo.
           */
          weight_g: number | null
          connectivity: string | null
          mouse_shape: string | null
          keyboard_layout: string | null
          surface: string | null
          profile: string | null
          panel_type: string | null
          refresh_rate: number | null
          /** Ordem numérica auxiliar de `tier` (GOAT=0 ... L=6), para ORDER BY. */
          tier_rank: number | null
        }
        Insert: Omit<Database["public"]["Tables"]["peripherals"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["peripherals"]["Insert"]>
      }
      brands: {
        Relationships: []
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["brands"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["brands"]["Insert"]>
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
          account_tier: "common" | "vip"
          /** Handle sem "@" — exibido como ícone clicável no perfil público. */
          youtube_handle: string | null
          tiktok_handle: string | null
          /** Incrementado só via RPC `increment_profile_views` — nunca escrito direto. */
          profile_views: number
          /** Ban restrito ao Mercado — não impede login nem o resto da conta. */
          market_banned_at: string | null
          market_ban_reason: string | null
          /** Aceite do termo de integridade das mini reviews (item 1.2) — registrado 1x, nunca reexibido depois. */
          reviews_integrity_accepted_at: string | null
          /** Cache do id de cliente no Asaas — evita recriar o customer a cada compra. */
          asaas_customer_id: string | null
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
          /** 'event' = concedida por campanha em /admin/eventos; 'general' = catálogo fixo. */
          category: "general" | "event"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["medals"]["Row"], "id" | "created_at" | "category"> &
          Partial<Pick<Database["public"]["Tables"]["medals"]["Row"], "category">>
        Update: Partial<Database["public"]["Tables"]["medals"]["Insert"]>
      }
      achievements: {
        Relationships: []
        Row: {
          id: string
          slug: string
          track: "posts" | "comments" | "followers" | "aura_earned"
          tier: "bronze" | "silver" | "gold" | "platinum" | "diamond"
          threshold: number
          name: string
          description: string | null
          aura_reward: number
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["achievements"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["achievements"]["Insert"]>
      }
      user_achievements: {
        Relationships: []
        Row: {
          user_id: string
          achievement_id: string
          awarded_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["user_achievements"]["Row"], "awarded_at"> & {
          awarded_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_achievements"]["Insert"]>
      }
      daily_missions: {
        Relationships: []
        Row: {
          user_id: string
          mission_date: string
          created_post: boolean
          gave_aura: boolean
          wrote_comment: boolean
          bonus_claimed: boolean
          updated_at: string
        }
        Insert: {
          user_id: string
          mission_date: string
          created_post?: boolean
          gave_aura?: boolean
          wrote_comment?: boolean
          bonus_claimed?: boolean
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["daily_missions"]["Insert"]>
      }
      user_streaks: {
        Relationships: []
        Row: {
          user_id: string
          current_streak: number
          longest_streak: number
          last_completed_date: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          current_streak?: number
          longest_streak?: number
          last_completed_date?: string | null
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_streaks"]["Insert"]>
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
          /** Aponta pro pai imediato — thread de até 4 níveis (raiz > resposta > resposta > resposta). */
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
          role: "webmaster" | "admin" | "moderator" | "editor" | "vendedor" | "suporte"
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
          /** Aponta pro pai imediato — thread de até 4 níveis (raiz > resposta > resposta > resposta). */
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
      forum_saved_posts: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          post_id: string
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["forum_saved_posts"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["forum_saved_posts"]["Insert"]>
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
      peripheral_comments: {
        Relationships: []
        Row: {
          id: string
          peripheral_id: string
          body: string
          /** Coluna gerada (`left(body, 140)`) — nunca enviada no Insert/Update. */
          body_preview: string
          author_name: string
          user_id: string | null
          /** Aponta pro pai imediato — thread de até 4 níveis (raiz > resposta > resposta > resposta). */
          parent_comment_id: string | null
          is_hidden: boolean
          aura_count: number
          /** Até 2 URLs do bucket `comments` — limite também travado por CHECK no banco. */
          image_urls: string[]
          /** Até 2 ids de usuário @mencionados. */
          mentioned_user_ids: string[]
          /** Última edição do texto pelo autor (janela de 15min). Null = nunca editado. */
          edited_at: string | null
          /** Coluna gerada (`edited_at is not null`) — nunca enviada no Insert/Update. */
          is_edited: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["peripheral_comments"]["Row"],
          "id" | "body_preview" | "is_edited" | "edited_at" | "created_at" | "updated_at"
        > & { edited_at?: string | null }
        Update: Partial<Database["public"]["Tables"]["peripheral_comments"]["Insert"]>
      }
      peripheral_aura: {
        Relationships: []
        Row: {
          id: string
          giver_id: string
          comment_id: string
          kind: "like" | "dislike"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["peripheral_aura"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["peripheral_aura"]["Insert"]>
      }
      peripheral_votes: {
        Relationships: []
        Row: {
          id: string
          peripheral_id: string
          voter_id: string
          kind: "like" | "dislike"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["peripheral_votes"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["peripheral_votes"]["Insert"]>
      }
      peripheral_reviews: {
        Relationships: []
        Row: {
          id: string
          peripheral_id: string
          user_id: string
          /** 1.0-5.0 em passos de meia estrela. */
          rating: number
          body: string | null
          /** Coluna gerada (`left(body, 140)`) — nunca enviada no Insert/Update. */
          body_preview: string | null
          /** Coluna gerada (`body is not null and length(btrim(body)) > 0`) — nunca enviada no Insert/Update. */
          has_text: boolean
          is_hidden: boolean
          edited_at: string | null
          /** Coluna gerada (`edited_at is not null`) — nunca enviada no Insert/Update. */
          is_edited: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["peripheral_reviews"]["Row"],
          "id" | "body_preview" | "has_text" | "is_edited" | "edited_at" | "created_at" | "updated_at"
        > & { edited_at?: string | null }
        Update: Partial<Database["public"]["Tables"]["peripheral_reviews"]["Insert"]>
      }
      user_aura_wallet: {
        Relationships: []
        Row: {
          user_id: string
          balance: number
          total_earned: number
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
            | "daily_mission_completed"
            | "daily_streak_bonus"
            | "achievement_unlocked"
            | "peripheral_comment_aura_received"
            | "peripheral_comment_aura_removed"
            | "peripheral_comment_aura_disliked"
            | "peripheral_comment_aura_undisliked"
            | "peripheral_comment_created"
            | "peripheral_review_created"
          source_post_id: string | null
          source_comment_id: string | null
          source_blog_post_id: string | null
          source_blog_comment_id: string | null
          source_peripheral_id: string | null
          source_peripheral_comment_id: string | null
          source_peripheral_review_id: string | null
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
      site_visits: {
        Relationships: []
        Row: {
          id: string
          visitor_hash: string
          visited_date: string
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["site_visits"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["site_visits"]["Insert"]>
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
          promo_price_cents: number | null
          stock: number | null
          images: string[]
          category: string | null
          brand: string | null
          type: "store" | "bazaar"
          condition: "new" | "used" | "opened"
          condition_notes: string | null
          sale_type: "pre_order" | "ready_stock" | "normal"
          is_active: boolean
          is_sold_out: boolean
          is_featured: boolean
          peripheral_id: string | null
          features: string[]
          video_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          price_cents: number
          promo_price_cents?: number | null
          stock?: number | null
          images?: string[]
          category?: string | null
          brand?: string | null
          type: "store" | "bazaar"
          condition?: "new" | "used" | "opened"
          condition_notes?: string | null
          sale_type?: "pre_order" | "ready_stock" | "normal"
          is_active?: boolean
          is_sold_out?: boolean
          is_featured?: boolean
          peripheral_id?: string | null
          features?: string[]
          video_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          price_cents?: number
          promo_price_cents?: number | null
          stock?: number | null
          images?: string[]
          category?: string | null
          brand?: string | null
          type?: "store" | "bazaar"
          condition?: "new" | "used" | "opened"
          condition_notes?: string | null
          sale_type?: "pre_order" | "ready_stock" | "normal"
          is_active?: boolean
          is_sold_out?: boolean
          is_featured?: boolean
          peripheral_id?: string | null
          features?: string[]
          video_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      store_product_specs: {
        Relationships: []
        Row: {
          id: string
          product_id: string
          label: string
          value: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          label: string
          value: string
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          label?: string
          value?: string
          position?: number
          created_at?: string
        }
      }
      store_product_peripherals: {
        Relationships: []
        Row: {
          product_id: string
          peripheral_id: string
          position: number
          created_at: string
        }
        Insert: {
          product_id: string
          peripheral_id: string
          position?: number
          created_at?: string
        }
        Update: {
          product_id?: string
          peripheral_id?: string
          position?: number
          created_at?: string
        }
      }
      store_product_variants: {
        Relationships: []
        Row: {
          id: string
          product_id: string
          label: string
          price_cents_override: number | null
          promo_price_cents: number | null
          stock: number | null
          position: number
          is_active: boolean
          color: string | null
          icon: string | null
          image_url: string | null
          is_sold_out: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          label: string
          price_cents_override?: number | null
          promo_price_cents?: number | null
          stock?: number | null
          position?: number
          is_active?: boolean
          color?: string | null
          icon?: string | null
          image_url?: string | null
          is_sold_out?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          label?: string
          price_cents_override?: number | null
          promo_price_cents?: number | null
          stock?: number | null
          position?: number
          is_active?: boolean
          color?: string | null
          icon?: string | null
          image_url?: string | null
          is_sold_out?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      store_product_variant_groups: {
        Relationships: []
        Row: {
          id: string
          product_id: string
          name: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          name: string
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          name?: string
          position?: number
          created_at?: string
        }
      }
      store_product_variant_group_options: {
        Relationships: []
        Row: {
          id: string
          group_id: string
          label: string
          price_cents_override: number | null
          is_sold_out: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          label: string
          price_cents_override?: number | null
          is_sold_out?: boolean
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          label?: string
          price_cents_override?: number | null
          is_sold_out?: boolean
          position?: number
          created_at?: string
        }
      }
      store_product_variant_images: {
        Relationships: []
        Row: {
          id: string
          variant_id: string
          url: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          variant_id: string
          url: string
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          variant_id?: string
          url?: string
          position?: number
          created_at?: string
        }
      }
      store_product_price_history: {
        Relationships: []
        Row: {
          id: string
          product_id: string
          variant_id: string | null
          price_cents: number
          promo_price_cents: number | null
          final_price_cents: number
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          variant_id?: string | null
          price_cents: number
          promo_price_cents?: number | null
          final_price_cents: number
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          variant_id?: string | null
          price_cents?: number
          promo_price_cents?: number | null
          final_price_cents?: number
          created_at?: string
        }
      }
      store_product_reviews: {
        Relationships: []
        Row: {
          id: string
          product_id: string
          user_id: string
          order_id: string | null
          rating: number
          title: string | null
          body: string
          is_verified_purchase: boolean
          status: "published" | "hidden"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          user_id: string
          order_id?: string | null
          rating: number
          title?: string | null
          body: string
          is_verified_purchase?: boolean
          status?: "published" | "hidden"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          user_id?: string
          order_id?: string | null
          rating?: number
          title?: string | null
          body?: string
          is_verified_purchase?: boolean
          status?: "published" | "hidden"
          created_at?: string
          updated_at?: string
        }
      }
      store_product_sunano_reviews: {
        Relationships: []
        Row: {
          id: string
          product_id: string
          rating: number | null
          title: string
          body: string
          video_url: string | null
          author_admin_id: string | null
          published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          rating?: number | null
          title: string
          body: string
          video_url?: string | null
          author_admin_id?: string | null
          published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          rating?: number | null
          title?: string
          body?: string
          video_url?: string | null
          author_admin_id?: string | null
          published?: boolean
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
          misticpay_transaction_id: string | null
          misticpay_e2e: string | null
          asaas_payment_id: string | null
          asaas_customer_id: string | null
          asaas_receipt_url: string | null
          pix_copy_paste: string | null
          pix_qr_code_base64: string | null
          pix_expires_at: string | null
          access_token: string | null
          customer_email: string | null
          customer_name: string | null
          items: Record<string, unknown>[]
          total_cents: number
          status: "pending" | "paid" | "awaiting_shipping_info" | "shipped" | "delivered" | "cancelled" | "refunded" | "expired"
          payment_method: string | null
          metadata: Record<string, unknown>
          tracking_code: string | null
          carrier: string | null
          shipped_at: string | null
          delivered_at: string | null
          refunded_cents: number
          refund_reason: string | null
          refunded_at: string | null
          affiliate_id: string | null
          affiliate_code: string | null
          user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stripe_session_id?: string | null
          stripe_payment_intent_id?: string | null
          misticpay_transaction_id?: string | null
          misticpay_e2e?: string | null
          asaas_payment_id?: string | null
          asaas_customer_id?: string | null
          asaas_receipt_url?: string | null
          pix_copy_paste?: string | null
          pix_qr_code_base64?: string | null
          pix_expires_at?: string | null
          access_token?: string | null
          customer_email?: string | null
          customer_name?: string | null
          items: Record<string, unknown>[]
          total_cents: number
          status?: "pending" | "paid" | "awaiting_shipping_info" | "shipped" | "delivered" | "cancelled" | "refunded" | "expired"
          payment_method?: string | null
          metadata?: Record<string, unknown>
          tracking_code?: string | null
          carrier?: string | null
          shipped_at?: string | null
          delivered_at?: string | null
          refunded_cents?: number
          refund_reason?: string | null
          refunded_at?: string | null
          affiliate_id?: string | null
          affiliate_code?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          stripe_session_id?: string | null
          stripe_payment_intent_id?: string | null
          misticpay_transaction_id?: string | null
          misticpay_e2e?: string | null
          asaas_payment_id?: string | null
          asaas_customer_id?: string | null
          asaas_receipt_url?: string | null
          pix_copy_paste?: string | null
          pix_qr_code_base64?: string | null
          pix_expires_at?: string | null
          access_token?: string | null
          customer_email?: string | null
          customer_name?: string | null
          items?: Record<string, unknown>[]
          total_cents?: number
          status?: "pending" | "paid" | "awaiting_shipping_info" | "shipped" | "delivered" | "cancelled" | "refunded" | "expired"
          payment_method?: string | null
          metadata?: Record<string, unknown>
          tracking_code?: string | null
          carrier?: string | null
          shipped_at?: string | null
          delivered_at?: string | null
          refunded_cents?: number
          refund_reason?: string | null
          refunded_at?: string | null
          affiliate_id?: string | null
          affiliate_code?: string | null
          user_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      support_tickets: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          subject: string
          order_id: string | null
          product_id: string | null
          status: "open" | "resolved" | "cancelled"
          waiting_on: "user" | "admin" | "closed"
          message_count: number
          last_message_at: string
          last_message_preview: string | null
          last_message_sender: "user" | "admin" | null
          rating: number | null
          rating_comment: string | null
          rated_at: string | null
          created_at: string
          updated_at: string
          closed_at: string | null
          closed_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          subject: string
          order_id?: string | null
          product_id?: string | null
          status?: "open" | "resolved" | "cancelled"
          waiting_on?: "user" | "admin" | "closed"
          message_count?: number
          last_message_at?: string
          last_message_preview?: string | null
          last_message_sender?: "user" | "admin" | null
          rating?: number | null
          rating_comment?: string | null
          rated_at?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          closed_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          subject?: string
          order_id?: string | null
          product_id?: string | null
          status?: "open" | "resolved" | "cancelled"
          waiting_on?: "user" | "admin" | "closed"
          message_count?: number
          last_message_at?: string
          last_message_preview?: string | null
          last_message_sender?: "user" | "admin" | null
          rating?: number | null
          rating_comment?: string | null
          rated_at?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          closed_by?: string | null
        }
      }
      support_messages: {
        Relationships: []
        Row: {
          id: string
          ticket_id: string
          sender_type: "user" | "admin"
          sender_id: string
          sender_name: string
          body: string
          image_urls: string[]
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          sender_type: "user" | "admin"
          sender_id: string
          sender_name: string
          body: string
          image_urls?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          sender_type?: "user" | "admin"
          sender_id?: string
          sender_name?: string
          body?: string
          image_urls?: string[]
          created_at?: string
        }
      }
      market_listings: {
        Relationships: []
        Row: {
          id: string
          seller_id: string
          title: string
          description: string | null
          price_cents: number
          initial_price_cents: number
          olx_url: string
          images: string[]
          status: "pending_review" | "active" | "rejected" | "sold" | "removed"
          fee_cents: number
          fee_status: "waived" | "pending" | "paid"
          is_free_vip_slot: boolean
          asaas_payment_id: string | null
          asaas_customer_id: string | null
          pix_copy_paste: string | null
          pix_qr_code_base64: string | null
          pix_expires_at: string | null
          rejection_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          seller_id: string
          title: string
          description?: string | null
          price_cents: number
          initial_price_cents: number
          olx_url: string
          images?: string[]
          status?: "pending_review" | "active" | "rejected" | "sold" | "removed"
          fee_cents?: number
          fee_status?: "waived" | "pending" | "paid"
          is_free_vip_slot?: boolean
          asaas_payment_id?: string | null
          asaas_customer_id?: string | null
          pix_copy_paste?: string | null
          pix_qr_code_base64?: string | null
          pix_expires_at?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          seller_id?: string
          title?: string
          description?: string | null
          price_cents?: number
          initial_price_cents?: number
          olx_url?: string
          images?: string[]
          status?: "pending_review" | "active" | "rejected" | "sold" | "removed"
          fee_cents?: number
          fee_status?: "waived" | "pending" | "paid"
          is_free_vip_slot?: boolean
          asaas_payment_id?: string | null
          asaas_customer_id?: string | null
          pix_copy_paste?: string | null
          pix_qr_code_base64?: string | null
          pix_expires_at?: string | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      market_listing_price_changes: {
        Relationships: []
        Row: {
          id: string
          listing_id: string
          old_price_cents: number
          new_price_cents: number
          changed_at: string
        }
        Insert: {
          id?: string
          listing_id: string
          old_price_cents: number
          new_price_cents: number
          changed_at?: string
        }
        Update: {
          id?: string
          listing_id?: string
          old_price_cents?: number
          new_price_cents?: number
          changed_at?: string
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
      affiliates: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          code: string | null
          status: "pending" | "approved" | "rejected" | "suspended"
          commission_bps: number
          balance_cents: number
          pix_key: string | null
          pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random" | null
          rejection_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          approved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          code?: string | null
          status?: "pending" | "approved" | "rejected" | "suspended"
          commission_bps?: number
          balance_cents?: number
          pix_key?: string | null
          pix_key_type?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          code?: string | null
          status?: "pending" | "approved" | "rejected" | "suspended"
          commission_bps?: number
          balance_cents?: number
          pix_key?: string | null
          pix_key_type?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      affiliate_commission_events: {
        Relationships: []
        Row: {
          id: string
          affiliate_id: string
          order_id: string
          type: "credit" | "refund_debit" | "adjustment"
          amount_cents: number
          order_total_cents: number
          commission_bps: number
          related_event_id: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          affiliate_id: string
          order_id: string
          type: "credit" | "refund_debit" | "adjustment"
          amount_cents: number
          order_total_cents: number
          commission_bps: number
          related_event_id?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          affiliate_id?: string
          order_id?: string
          type?: "credit" | "refund_debit" | "adjustment"
          amount_cents?: number
          order_total_cents?: number
          commission_bps?: number
          related_event_id?: string | null
          note?: string | null
          created_at?: string
        }
      }
      affiliate_payout_requests: {
        Relationships: []
        Row: {
          id: string
          affiliate_id: string
          amount_cents: number
          status: "requested" | "paid" | "rejected" | "cancelled"
          pix_key: string
          pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random"
          admin_note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          paid_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          affiliate_id: string
          amount_cents: number
          status?: "requested" | "paid" | "rejected" | "cancelled"
          pix_key: string
          pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random"
          admin_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          affiliate_id?: string
          amount_cents?: number
          status?: "requested" | "paid" | "rejected" | "cancelled"
          pix_key?: string
          pix_key_type?: "cpf" | "cnpj" | "email" | "phone" | "random"
          admin_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          paid_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      count_orders_by_status: {
        Args: Record<string, never>
        Returns: { status: string; count: number }[]
      }
      broadcast_system_notification: {
        Args: { p_title: string; p_body: string; p_link?: string | null; p_user_id?: string | null }
        Returns: number
      }
      decrement_store_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: boolean
      }
      decrement_variant_stock: {
        Args: { p_variant_id: string; p_quantity: number }
        Returns: boolean
      }
      increment_store_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: boolean
      }
      increment_variant_stock: {
        Args: { p_variant_id: string; p_quantity: number }
        Returns: boolean
      }
      get_recent_product_purchase_quantity: {
        Args: { p_user_id: string; p_product_id: string; p_since: string }
        Returns: number
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
      check_and_award_track_achievements: {
        Args: { p_user_id: string; p_track: "posts" | "comments" | "followers" | "aura_earned"; p_count: number }
        Returns: undefined
      }
      complete_daily_mission: {
        Args: { p_user_id: string; p_mission: "post" | "aura" | "comment" }
        Returns: { all_completed: boolean; streak: number }[]
      }
      toggle_peripheral_comment_aura: {
        Args: { p_giver_id: string; p_comment_id: string; p_kind?: "like" | "dislike" }
        Returns: { reaction: "like" | "dislike" | null; aura_count: number }[]
      }
      credit_peripheral_comment_creation_aura: {
        Args: { p_user_id: string; p_peripheral_id: string }
        Returns: boolean
      }
      toggle_peripheral_vote: {
        Args: { p_voter_id: string; p_peripheral_id: string; p_kind: "like" | "dislike" }
        Returns: { reaction: "like" | "dislike" | null; likes: number; dislikes: number }[]
      }
      credit_peripheral_review_creation_aura: {
        Args: { p_user_id: string; p_peripheral_id: string; p_review_id: string }
        Returns: boolean
      }
      apply_affiliate_commission_event: {
        Args: {
          p_affiliate_id: string
          p_order_id: string
          p_delta_cents: number
          p_type: "credit" | "refund_debit" | "adjustment"
          p_order_total_cents: number
          p_commission_bps: number
          p_related_event_id?: string | null
          p_note?: string | null
        }
        Returns: string | null
      }
      request_affiliate_payout: {
        Args: { p_affiliate_id: string; p_amount_cents: number; p_pix_key: string; p_pix_key_type: string }
        Returns: string | null
      }
    }
  }
}
