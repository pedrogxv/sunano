-- Forum performance indexes
-- Run once against the production database.

-- ── forum_posts ──────────────────────────────────────────────────────────────

-- Public feed: visible posts ordered by date (most common query)
create index if not exists idx_forum_posts_visible_feed
  on public.forum_posts (created_at desc)
  where is_hidden = false;

-- Admin listing: all posts by date (no filter)
create index if not exists idx_forum_posts_created_at
  on public.forum_posts (created_at desc);

-- Admin filter by visibility
create index if not exists idx_forum_posts_is_hidden
  on public.forum_posts (is_hidden, created_at desc);

-- Admin filter by locked state
create index if not exists idx_forum_posts_is_locked
  on public.forum_posts (is_locked, created_at desc);

-- Slug lookup (single-post page)
create unique index if not exists idx_forum_posts_slug
  on public.forum_posts (slug);

-- User's own posts
create index if not exists idx_forum_posts_user_id
  on public.forum_posts (user_id, created_at desc)
  where user_id is not null;

-- GIN index for peripheral_refs array (used in peripheral → forum lookups)
create index if not exists idx_forum_posts_peripheral_refs_gin
  on public.forum_posts using gin (peripheral_refs);

-- ── forum_comments ───────────────────────────────────────────────────────────

-- Fetch visible comments for a post (public thread page)
create index if not exists idx_forum_comments_visible
  on public.forum_comments (post_id, created_at asc)
  where is_hidden = false;

-- Admin: all comments for a set of posts
create index if not exists idx_forum_comments_post_id
  on public.forum_comments (post_id, created_at asc);

-- User's own comments
create index if not exists idx_forum_comments_user_id
  on public.forum_comments (user_id, created_at desc)
  where user_id is not null;

-- GIN index for peripheral_refs array on comments
create index if not exists idx_forum_comments_peripheral_refs_gin
  on public.forum_comments using gin (peripheral_refs);

-- ── Optional: pg_trgm full-text search ───────────────────────────────────────
-- Enables fast ILIKE '%term%' on title and author_name without a full seq scan.
-- Uncomment after running: create extension if not exists pg_trgm;
--
-- create index if not exists idx_forum_posts_title_trgm
--   on public.forum_posts using gin (title gin_trgm_ops);
--
-- create index if not exists idx_forum_posts_author_trgm
--   on public.forum_posts using gin (author_name gin_trgm_ops);
