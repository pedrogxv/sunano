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
  | "store_restock"
  | "affiliate_payout"

export type NotificationEntityType =
  | "forum_post"
  | "forum_comment"
  | "blog_post"
  | "blog_comment"
  | "user"
  | "order"
  | "support_ticket"
  | "store_product"
  | "affiliate_payout"

export type Database = {
  public: {
    Tables: {
      peripherals: {
        Relationships: []
        Row: {
          id: string
          name: string
          brand_id: string
          category: "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp" | "psu"
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
          /**
           * Endereço de COBRANÇA — é o que vai para o customer da Asaas no
           * cartão. O endereço de ENTREGA vive nas colunas `shipping_*`
           * abaixo; dividir as mesmas colunas fazia uma compra para
           * presentear sobrescrever o endereço do titular.
           */
          phone: string | null
          postal_code: string | null
          street: string | null
          number: string | null
          complement: string | null
          neighborhood: string | null
          city: string | null
          state: string | null
          /** Última ENTREGA usada, só para pré-preencher o checkout. */
          shipping_recipient: string | null
          shipping_phone: string | null
          shipping_postal_code: string | null
          shipping_street: string | null
          shipping_number: string | null
          shipping_complement: string | null
          shipping_neighborhood: string | null
          shipping_city: string | null
          shipping_state: string | null
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
          /** Validade do VIP comprado com Aura. NULL = sem expiração (VIP manual do admin, ou nunca comprado). */
          vip_expires_at: string | null
          /** Handle sem "@" — exibido como ícone clicável no perfil público. */
          youtube_handle: string | null
          tiktok_handle: string | null
          /** Incrementado só via RPC `increment_profile_views` — nunca escrito direto. */
          profile_views: number
          /**
           * Resquício do Mercado, removido do produto em 2026-09-12. As colunas
           * seguem no banco (dados históricos), mas nenhum código as lê ou
           * escreve — não reintroduzir uso sem trazer o Mercado de volta.
           */
          market_banned_at: string | null
          market_ban_reason: string | null
          /** Ban geral da conta — bloqueia login e some das listagens públicas (fórum/blog/reviews ocultos, fora de rankings). */
          account_banned_at: string | null
          account_ban_reason: string | null
          /**
           * "Pacote Loja": libera Loja + Programa de Afiliados para este
           * usuário mesmo com STORE_MAINTENANCE_MODE=true. Concedido só por
           * WEB MASTER em /admin/users; protegido contra auto-concessão pelo
           * trigger `enforce_store_access_grant` (RLS não filtra coluna).
           */
          store_access: boolean
          /** Aceite do termo de integridade das mini reviews (item 1.2) — registrado 1x, nunca reexibido depois. */
          reviews_integrity_accepted_at: string | null
          /** Cache do id de cliente no Asaas — evita recriar o customer a cada compra. */
          asaas_customer_id: string | null
          /** Item (kind=avatar_frame) equipado — deve estar em `user_aura_items` do mesmo usuário, reforçado na aplicação. */
          equipped_avatar_frame_id: string | null
          /** Item (kind=mini_profile_bg) equipado como tema animado do cartão de Mini Perfil. Slot independente de `equipped_avatar_frame_id`. */
          equipped_mini_profile_bg_id: string | null
          /** Timestamp da última troca paga de nome — usado para o cooldown de 3 dias em `change_display_name_with_aura`. */
          display_name_changed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["user_profiles"]["Row"],
          // `store_access` tem default no banco e só o WEB MASTER concede
          // (ver /admin/users) — nunca faz parte da criação do perfil.
          "created_at" | "updated_at" | "display_slug" | "profile_views" | "store_access"
        >
        // `store_access` não entra no Insert (tem default no banco), mas É
        // atualizável — é exatamente assim que o WEB MASTER concede/revoga o
        // "pacote Loja" em PATCH /api/admin/users.
        Update: Partial<Database["public"]["Tables"]["user_profiles"]["Insert"]> & {
          store_access?: boolean
        }
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
      aura_items: {
        Relationships: []
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          kind:
            | "avatar_frame"
            | "vip_month"
            | "display_name_change"
            | "streak_shield"
            | "mini_profile_bg"
            | "peripheral"
          image_url: string | null
          frame_asset_url: string | null
          aura_cost: number
          active: boolean
          sort_order: number
          /** Unidades disponíveis — só usado por kind=peripheral. Default 1. */
          stock: number
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["aura_items"]["Row"], "id" | "created_at" | "kind" | "active" | "sort_order" | "stock"> &
          Partial<Pick<Database["public"]["Tables"]["aura_items"]["Row"], "kind" | "active" | "sort_order" | "stock">>
        Update: Partial<Database["public"]["Tables"]["aura_items"]["Insert"]>
      }
      user_aura_items: {
        Relationships: []
        Row: {
          user_id: string
          item_id: string
          acquired_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["user_aura_items"]["Row"], "acquired_at"> & {
          acquired_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_aura_items"]["Insert"]>
      }
      aura_purchases: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          /** FK `on delete set null` — pode ficar null se o item da loja for deletado. */
          item_id: string | null
          /** Snapshot: sobrevive à renomeação/exclusão do item. */
          item_slug: string
          item_name: string
          item_kind: string
          /** Custo de tabela no momento da compra. */
          list_price: number
          /** O que saiu da carteira (list_price, ou -10% p/ VIP). */
          amount_paid: number
          vip_discount_applied: boolean
          /** Saldo antes/depois do débito. NULL só em linhas retroativas (backfill). */
          balance_before: number | null
          balance_after: number | null
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["aura_purchases"]["Row"], "id" | "created_at" | "vip_discount_applied" | "balance_before" | "balance_after"> &
          Partial<Pick<Database["public"]["Tables"]["aura_purchases"]["Row"], "id" | "created_at" | "vip_discount_applied" | "balance_before" | "balance_after">>
        Update: Partial<Database["public"]["Tables"]["aura_purchases"]["Insert"]>
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
      referral_codes: {
        Relationships: []
        Row: {
          user_id: string
          code: string
          customized_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          code: string
          customized_at?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["referral_codes"]["Insert"]>
      }
      referrals: {
        Relationships: []
        Row: {
          referred_user_id: string
          referrer_user_id: string
          status: "pending" | "validated" | "rejected" | "expired"
          validated_via: "discord_member" | "oauth_identity" | "streak_3d" | null
          signup_ip: string | null
          signup_ip_prefix: string | null
          expires_at: string
          validated_at: string | null
          rejected_reason: string | null
          created_at: string
        }
        Insert: {
          referred_user_id: string
          referrer_user_id: string
          status?: "pending" | "validated" | "rejected" | "expired"
          validated_via?: "discord_member" | "oauth_identity" | "streak_3d" | null
          signup_ip?: string | null
          signup_ip_prefix?: string | null
          expires_at: string
          validated_at?: string | null
          rejected_reason?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["referrals"]["Insert"]>
      }
      referral_verified_identities: {
        Relationships: []
        Row: {
          provider: "google" | "discord"
          provider_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          provider: "google" | "discord"
          provider_id: string
          user_id: string
          verified_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["referral_verified_identities"]["Insert"]>
      }
      user_streak_shields: {
        Relationships: []
        Row: {
          user_id: string
          grace_days: number
          source_item_slug: string
          armed_at: string
          consumed_at: string | null
        }
        Insert: {
          user_id: string
          grace_days: number
          source_item_slug: string
          armed_at?: string
          consumed_at?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["user_streak_shields"]["Insert"]>
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
      user_youtube_subscription: {
        Relationships: []
        Row: {
          user_id: string
          confirmed_at: string
        }
        Insert: {
          user_id: string
          confirmed_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_youtube_subscription"]["Insert"]>
      }
      user_discord_membership: {
        Relationships: []
        Row: {
          user_id: string
          discord_user_id: string
          confirmed_at: string
        }
        Insert: {
          user_id: string
          discord_user_id: string
          confirmed_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_discord_membership"]["Insert"]>
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
          /** "news" alimenta /noticias; "review" alimenta /blog. */
          post_type: "news" | "review"
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
      forum_post_peripherals: {
        Relationships: []
        Row: {
          post_id: string
          peripheral_id: string
          /** 'auto' = detectado ao publicar/editar; 'manual' = confirmado pelo autor; 'backfill' = script one-off. */
          source: "auto" | "manual" | "backfill"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["forum_post_peripherals"]["Row"], "source" | "created_at"> &
          Partial<Pick<Database["public"]["Tables"]["forum_post_peripherals"]["Row"], "source">>
        Update: Partial<Database["public"]["Tables"]["forum_post_peripherals"]["Insert"]>
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
      peripheral_review_votes: {
        Relationships: []
        Row: {
          id: string
          review_id: string
          voter_id: string
          kind: "like" | "dislike"
          created_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["peripheral_review_votes"]["Row"], "id" | "created_at">
        Update: Partial<Database["public"]["Tables"]["peripheral_review_votes"]["Insert"]>
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
          /** Upvotes - downvotes (`peripheral_review_votes`), denormalizado. */
          score: number
          is_hidden: boolean
          edited_at: string | null
          /** Coluna gerada (`edited_at is not null`) — nunca enviada no Insert/Update. */
          is_edited: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<
          Database["public"]["Tables"]["peripheral_reviews"]["Row"],
          "id" | "body_preview" | "has_text" | "score" | "is_edited" | "edited_at" | "created_at" | "updated_at"
        > & { edited_at?: string | null; score?: number }
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
            | "aura_item_redeemed"
            | "youtube_subscription_confirmed"
            | "vip_purchased"
            | "display_name_changed"
            | "streak_shield_purchased"
            | "account_banned_adjustment"
            | "discord_membership_confirmed"
            | "referral_signup"
            | "referral_indirect"
            | "aura_peripheral_redeemed"
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
      offers_cache: {
        Relationships: []
        Row: {
          id: string
          message_id: number
          text: string
          posted_at: string
          author: string | null
          author_avatar: { url: string; width: number | null; height: number | null } | null
          chat_title: string | null
          url: string | null
          image: { url: string; width: number | null; height: number | null } | null
          first_seen_at: string
          last_seen_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["offers_cache"]["Row"], "first_seen_at" | "last_seen_at"> & {
          first_seen_at?: string
          last_seen_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["offers_cache"]["Insert"]>
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
          /** Teto de unidades em pré-venda (null = sem teto). Só vale com sale_type = pre_order. */
          preorder_limit: number | null
          /** false = produto que não é enviado (digital/serviço) — o checkout não pede endereço de entrega. */
          requires_shipping: boolean
          is_active: boolean
          is_sold_out: boolean
          is_featured: boolean
          pin_best_seller: boolean
          best_seller_position: number | null
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
          preorder_limit?: number | null
          requires_shipping?: boolean
          is_active?: boolean
          is_sold_out?: boolean
          is_featured?: boolean
          pin_best_seller?: boolean
          best_seller_position?: number | null
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
          preorder_limit?: number | null
          requires_shipping?: boolean
          is_active?: boolean
          is_sold_out?: boolean
          is_featured?: boolean
          pin_best_seller?: boolean
          best_seller_position?: number | null
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
      store_product_variant_combinations: {
        Relationships: []
        Row: {
          id: string
          product_id: string
          variant_id: string
          option_id: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          variant_id: string
          option_id: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          variant_id?: string
          option_id?: string
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
      store_stock_reservations: {
        Row: {
          id: string
          reservation_group: string
          product_id: string
          variant_id: string | null
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          reservation_group: string
          product_id: string
          variant_id?: string | null
          quantity: number
          created_at?: string
        }
        Update: {
          id?: string
          reservation_group?: string
          product_id?: string
          variant_id?: string | null
          quantity?: number
          created_at?: string
        }
        Relationships: []
      }
      store_restock_alerts: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          product_id: string
          /** null = inscrito no produto inteiro ("qualquer cor"). */
          variant_id: string | null
          notified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          variant_id?: string | null
          notified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          product_id?: string
          variant_id?: string | null
          notified_at?: string | null
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
          changed_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          variant_id?: string | null
          price_cents: number
          promo_price_cents?: number | null
          final_price_cents: number
          changed_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          variant_id?: string | null
          price_cents?: number
          promo_price_cents?: number | null
          final_price_cents?: number
          changed_by?: string | null
          created_at?: string
        }
      }
      store_admin_audit_log: {
        Relationships: []
        Row: {
          id: string
          admin_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          before: Record<string, unknown> | null
          after: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          admin_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          before?: Record<string, unknown> | null
          after?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          admin_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          before?: Record<string, unknown> | null
          after?: Record<string, unknown> | null
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
      /**
       * Vínculo pedido → thread do Discord que o acompanha (uma thread por
       * pedido, no canal DISCORD_ORDERS_CHANNEL_ID). Só a service role lê:
       * a tabela tem RLS ligado e nenhuma policy. Ver
       * lib/server/repositories/discord-orders-repository.ts.
       */
      discord_order_threads: {
        Relationships: []
        Row: {
          order_id: string
          channel_id: string
          thread_id: string
          /** Mensagem "painel" fixada na thread, editada a cada evento. */
          dashboard_message_id: string | null
          last_status: string | null
          /** Status + discriminador do último evento publicado (dedup). */
          last_event_key: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          order_id: string
          channel_id: string
          thread_id: string
          dashboard_message_id?: string | null
          last_status?: string | null
          last_event_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          order_id?: string
          channel_id?: string
          thread_id?: string
          dashboard_message_id?: string | null
          last_status?: string | null
          last_event_key?: string | null
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
          asaas_checkout_id: string | null
          asaas_installment_id: string | null
          installment_count: number | null
          pix_price_cents: number | null
          card_surcharge_percent: number | null
          /**
           * Aura debitada da carteira num resgate de produto físico da Central
           * (já com desconto VIP). Não-nulo = `payment_method='aura'` e
           * `total_cents` fica 0. Nulo em qualquer pedido pago em dinheiro.
           */
          aura_cost_paid: number | null
          /**
           * Endereço de ENTREGA — snapshot congelado no pedido (o cliente pode
           * mudar de endereço depois; o pedido registra para onde foi de fato).
           * Distinto do endereço de COBRANÇA em `user_profiles`, que existe só
           * porque a Asaas exige no customer do checkout de cartão.
           * Nulo enquanto o endereço for opcional / ainda não preenchido.
           */
          shipping_recipient: string | null
          shipping_phone: string | null
          shipping_postal_code: string | null
          shipping_street: string | null
          shipping_number: string | null
          shipping_complement: string | null
          shipping_neighborhood: string | null
          shipping_city: string | null
          shipping_state: string | null
          /** Não-nulo = endereço de entrega já informado (no checkout ou depois do pagamento). */
          shipping_address_filled_at: string | null
          requires_shipping_address: boolean
          /**
           * true = pedido criado com `ASAAS_ENV=sandbox` (pagamento de teste).
           * Gravado uma vez no checkout; telas do cliente, dashboard/receita e
           * a fila do admin filtram `is_sandbox = false` por padrão.
           */
          is_sandbox: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stripe_session_id?: string | null
          stripe_payment_intent_id?: string | null
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
          asaas_checkout_id?: string | null
          asaas_installment_id?: string | null
          installment_count?: number | null
          pix_price_cents?: number | null
          card_surcharge_percent?: number | null
          aura_cost_paid?: number | null
          shipping_recipient?: string | null
          shipping_phone?: string | null
          shipping_postal_code?: string | null
          shipping_street?: string | null
          shipping_number?: string | null
          shipping_complement?: string | null
          shipping_neighborhood?: string | null
          shipping_city?: string | null
          shipping_state?: string | null
          shipping_address_filled_at?: string | null
          requires_shipping_address?: boolean
          is_sandbox?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          stripe_session_id?: string | null
          stripe_payment_intent_id?: string | null
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
          asaas_checkout_id?: string | null
          asaas_installment_id?: string | null
          installment_count?: number | null
          pix_price_cents?: number | null
          card_surcharge_percent?: number | null
          aura_cost_paid?: number | null
          shipping_recipient?: string | null
          shipping_phone?: string | null
          shipping_postal_code?: string | null
          shipping_street?: string | null
          shipping_number?: string | null
          shipping_complement?: string | null
          shipping_neighborhood?: string | null
          shipping_city?: string | null
          shipping_state?: string | null
          shipping_address_filled_at?: string | null
          requires_shipping_address?: boolean
          is_sandbox?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      store_settings: {
        Relationships: []
        Row: {
          id: boolean
          card_surcharge_percent: number
          card_max_installments: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          card_surcharge_percent?: number
          card_max_installments?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          card_surcharge_percent?: number
          card_max_installments?: number
          updated_at?: string
          updated_by?: string | null
        }
      }
      user_tierlist_items: {
        Relationships: []
        Row: {
          user_id: string
          peripheral_id: string
          tier_id: string
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          peripheral_id: string
          tier_id: string
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_tierlist_items"]["Insert"]>
      }
      user_tierlist_tiers: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          position: number
          label: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          position: number
          label: string
          color: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_tierlist_tiers"]["Insert"]>
      }
      user_tierlist_meta: {
        Relationships: []
        Row: {
          user_id: string
          note: string | null
          hearts_count: number
          is_hidden: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          note?: string | null
          hearts_count?: number
          is_hidden?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_tierlist_meta"]["Insert"]>
      }
      user_tierlist_hearts: {
        Relationships: []
        Row: {
          owner_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          owner_id: string
          user_id: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_tierlist_hearts"]["Insert"]>
      }
      vip_subscriptions: {
        Relationships: []
        Row: {
          id: string
          user_id: string
          // NULL nas assinaturas PIX — o checkout hospedado só existe no cartão.
          asaas_checkout_id: string | null
          asaas_subscription_id: string | null
          asaas_customer_id: string
          status: "pending" | "active" | "past_due" | "canceled" | "expired"
          payment_method: "credit_card" | "pix"
          // Plano contratado. Escrito pelo servidor na criação, a partir do
          // catálogo de lib/vip-plan.ts — as RPCs de pagamento leem daqui
          // quanto tempo de acesso cada cobrança concede, NUNCA do webhook.
          billing_period: "monthly" | "yearly"
          pending_payment_id: string | null
          current_period_end: string | null
          // URL do checkout hospedado em aberto (só cartão) — deixa retomar o pagamento.
          checkout_link: string | null
          // Prazo do checkout em aberto: solta a trava local mesmo sem o webhook.
          checkout_expires_at: string | null
          created_at: string
          updated_at: string
          canceled_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          asaas_checkout_id?: string | null
          asaas_subscription_id?: string | null
          asaas_customer_id: string
          status?: "pending" | "active" | "past_due" | "canceled" | "expired"
          payment_method?: "credit_card" | "pix"
          billing_period?: "monthly" | "yearly"
          pending_payment_id?: string | null
          current_period_end?: string | null
          checkout_link?: string | null
          checkout_expires_at?: string | null
          created_at?: string
          updated_at?: string
          canceled_at?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["vip_subscriptions"]["Insert"]>
      }
      vip_subscription_payments: {
        Relationships: []
        Row: {
          asaas_payment_id: string
          subscription_id: string
          processed_at: string
        }
        Insert: {
          asaas_payment_id: string
          subscription_id: string
          processed_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["vip_subscription_payments"]["Insert"]>
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
          kind: string
          image_url: string | null
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
          kind?: string
          image_url?: string | null
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
          kind?: string
          image_url?: string | null
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
      store_section_banners: {
        Relationships: []
        Row: {
          id: string
          section: string
          image_url: string | null
          video_url: string | null
          title: string
          subtitle: string | null
          cta_text: string | null
          cta_link: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          section: string
          image_url?: string | null
          video_url?: string | null
          title: string
          subtitle?: string | null
          cta_text?: string | null
          cta_link?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          section?: string
          image_url?: string | null
          video_url?: string | null
          title?: string
          subtitle?: string | null
          cta_text?: string | null
          cta_link?: string | null
          sort_order?: number
          is_active?: boolean
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
          // Null em eventos que não vêm de uma venda (`payout_debit`).
          order_id: string | null
          payout_id: string | null
          type: "credit" | "refund_debit" | "adjustment" | "payout_debit"
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
          order_id?: string | null
          payout_id?: string | null
          type: "credit" | "refund_debit" | "adjustment" | "payout_debit"
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
          order_id?: string | null
          payout_id?: string | null
          type?: "credit" | "refund_debit" | "adjustment" | "payout_debit"
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
        /** `p_is_sandbox: null` = os dois ambientes; default da função é `false` (só produção). */
        Args: { p_is_sandbox?: boolean | null }
        Returns: { status: string; count: number }[]
      }
      get_order_revenue_between: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      get_top_selling_products: {
        Args: { p_from: string; p_to: string; p_limit?: number }
        Returns: { product_id: string; product_name: string | null; units_sold: number; revenue_cents: number }[]
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
      release_orphaned_stock_reservations: {
        Args: { p_older_than_minutes?: number }
        Returns: number
      }
      reserve_preorder: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_reservation_group: string
        }
        Returns: boolean
      }
      preorder_reserved_quantity: {
        Args: { p_product_id: string }
        Returns: number
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
      redeem_aura_item: {
        Args: { p_user_id: string; p_item_id: string }
        Returns: boolean
      }
      redeem_aura_peripheral: {
        Args: { p_user_id: string; p_item_id: string }
        Returns: string
      }
      replace_user_tierlist_tiers: {
        Args: { p_user_id: string; p_tiers: { id: string | null; label: string; color: string }[] }
        /** `"ok"` | `"in_use:<label>"` | `"bad_count"` */
        Returns: string
      }
      purchase_vip_with_aura: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      purchase_streak_shield: {
        Args: { p_user_id: string; p_item_id: string }
        Returns: number
      }
      streak_shield_covers_gap: {
        Args: {
          p_last_completed_date: string | null
          p_shield_armed: boolean | null
          p_grace_days: number | null
        }
        Returns: boolean
      }
      streak_is_alive: {
        Args: {
          p_last_completed_date: string | null
          p_shield_armed: boolean | null
          p_grace_days: number | null
        }
        Returns: boolean
      }
      is_vip_active: {
        Args: { p_account_tier: string; p_vip_expires_at: string | null }
        Returns: boolean
      }
      get_giver_trust_tier: {
        Args: { p_giver_id: string }
        Returns: string
      }
      get_aura_trust_limits: {
        Args: { p_giver_id: string }
        Returns: { trust_tier: string; daily_limit: number; pair_limit: number; skip_gain_bonus: boolean }[]
      }
      get_aura_ranking_by_period: {
        Args: { p_since: string; p_limit?: number }
        Returns: { user_id: string; gained: number }[]
      }
      get_activity_ranking_by_period: {
        Args: { p_since: string; p_limit?: number }
        Returns: { user_id: string; activity: number }[]
      }
      /** Contagem de comentários + "melhor comentário" (mais aura) de cada post, em 1 query — ver 20261010000000_forum_post_top_comment_preview.sql. */
      get_forum_posts_comment_summary: {
        Args: { p_post_ids: string[]; p_min_aura?: number }
        Returns: {
          post_id: string
          comment_count: number
          top_comment_id: string | null
          top_comment_preview: string | null
          top_comment_aura: number | null
          top_comment_user_id: string | null
          top_comment_author: string | null
          top_comment_at: string | null
          /** Primeira imagem/GIF do comentário destaque — `image_urls[1]`. */
          top_comment_image: string | null
          /** Total de imagens do comentário destaque (0-2). */
          top_comment_images: number | null
        }[]
      }
      get_forum_posts_saved_counts: {
        Args: { p_post_ids: string[] }
        Returns: {
          post_id: string
          saved_count: number
        }[]
      }
      expire_vip_accounts: {
        Args: Record<string, never>
        Returns: number
      }
      activate_vip_subscription: {
        Args: { p_asaas_checkout_id: string; p_asaas_subscription_id: string; p_asaas_payment_id: string }
        Returns: boolean
      }
      renew_vip_subscription: {
        Args: { p_asaas_subscription_id: string; p_asaas_payment_id: string }
        Returns: boolean
      }
      activate_vip_subscription_pix: {
        Args: { p_asaas_subscription_id: string; p_asaas_payment_id: string }
        Returns: boolean
      }
      set_vip_subscription_pending_payment: {
        Args: { p_asaas_subscription_id: string; p_asaas_payment_id: string }
        Returns: boolean
      }
      mark_vip_subscription_past_due: {
        Args: { p_asaas_subscription_id: string }
        Returns: boolean
      }
      end_vip_subscription: {
        Args: { p_asaas_subscription_id: string }
        Returns: boolean
      }
      cancel_vip_subscription: {
        Args: {
          p_user_id?: string | null
          p_asaas_subscription_id?: string | null
          p_asaas_checkout_id?: string | null
        }
        Returns: boolean
      }
      reconcile_vip_subscription: {
        Args: { p_user_id: string; p_asaas_active: boolean }
        Returns: boolean
      }
      reactivate_vip_subscription: {
        Args: {
          p_id: string
          p_user_id: string
          p_asaas_customer_id: string
          p_payment_method: string
          p_asaas_subscription_id: string
          p_current_period_end: string
        }
        Returns: boolean
      }
      change_display_name_with_aura: {
        Args: { p_user_id: string; p_new_name: string }
        Returns: boolean
      }
      admin_ban_account: {
        Args: { p_user_id: string; p_reason: string }
        Returns: undefined
      }
      admin_unban_account: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      confirm_youtube_subscription: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      confirm_discord_membership: {
        Args: { p_user_id: string; p_discord_user_id: string }
        Returns: "granted" | "already" | "account_in_use"
      }
      ensure_referral_code: {
        Args: { p_user_id: string; p_seed?: string | null }
        Returns: string
      }
      set_referral_code: {
        Args: { p_user_id: string; p_code: string }
        Returns: "ok" | "taken" | "already_customized" | "not_found"
      }
      register_referral: {
        Args: { p_referred_user_id: string; p_code: string; p_signup_ip?: string | null }
        Returns:
          | "ok"
          | "invalid_code"
          | "self_referral"
          | "already_referred"
          | "referrer_banned"
      }
      claim_referral_identity: {
        Args: { p_user_id: string; p_provider: "google" | "discord"; p_provider_id: string }
        Returns: "claimed" | "already_mine" | "in_use"
      }
      validate_referral: {
        Args: { p_referred_user_id: string; p_via: "discord_member" | "oauth_identity" | "streak_3d" }
        Returns:
          | "validated"
          | "not_pending"
          | "expired"
          | "capped_ip"
          | "capped_total"
          | "no_referral"
      }
      review_referral: {
        Args: { p_referred_user_id: string; p_approve: boolean; p_reason?: string | null }
        Returns: "validated" | "rejected" | "not_pending" | "no_referral"
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
      toggle_peripheral_review_vote: {
        Args: { p_voter_id: string; p_review_id: string; p_kind: "like" | "dislike" }
        Returns: { reaction: "like" | "dislike" | null; score: number }[]
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
        Returns: {
          ok: boolean
          code?: "not_found" | "below_minimum" | "insufficient_balance" | "too_many_pending"
          min_cents?: number
          available_cents?: number
          payout_id?: string
        }
      }
      mark_affiliate_payout_paid: {
        Args: { p_payout_id: string; p_reviewer_id: string }
        Returns: {
          ok: boolean
          code?: "not_found" | "not_pending"
          amount_cents?: number
          affiliate_id?: string
        }
      }
      cancel_affiliate_payout: {
        Args: { p_affiliate_id: string; p_payout_id: string }
        Returns: { ok: boolean; code?: "not_cancellable" }
      }
      affiliate_min_payout_cents: {
        Args: Record<string, never>
        Returns: number
      }
      prune_offers_cache: {
        Args: { retention_days?: number }
        Returns: undefined
      }
    }
  }
}
