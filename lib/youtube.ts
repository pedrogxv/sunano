import { createSupabaseAdminClient } from "@/lib/supabase-admin"

const DAILY_SYNC_LIMIT = 12
const SNAPSHOT_KEY = "youtube_channel_feed"

type YouTubeApiListResponse<T> = {
  items?: T[]
}

type YouTubePlaylistItemResource = {
  snippet?: {
    title?: string
    description?: string
    publishedAt?: string
    resourceId?: {
      videoId?: string
    }
    thumbnails?: {
      medium?: { url?: string }
      high?: { url?: string }
      default?: { url?: string }
    }
  }
}

type YouTubePlaylistItem = {
  id?: string
  snippet?: {
    title?: string
    description?: string
    publishedAt?: string
    thumbnails?: {
      medium?: { url?: string }
      high?: { url?: string }
      default?: { url?: string }
    }
  }
}

type YouTubeChannelItem = {
  id?: string
  snippet?: {
    title?: string
    description?: string
    customUrl?: string
    thumbnails?: {
      medium?: { url?: string }
      high?: { url?: string }
      default?: { url?: string }
    }
  }
  statistics?: {
    subscriberCount?: string
    viewCount?: string
    videoCount?: string
  }
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string
    }
  }
}

export type ChannelVideo = {
  id: string
  title: string
  description: string
  publishedAt: string
  thumbnailUrl: string
  watchUrl: string
}

export type ChannelPlaylist = {
  id: string
  title: string
  description: string
  publishedAt: string
  thumbnailUrl: string
  playlistUrl: string
}

export type ChannelInfo = {
  id: string
  title: string
  description: string
  customUrl: string | null
  thumbnailUrl: string
  subscriberCount: number | null
  viewCount: number | null
  videoCount: number | null
  channelUrl: string
  videosUrl: string
  playlistsUrl: string
}

export type ChannelFeedData = {
  channel: ChannelInfo
  videos: ChannelVideo[]
  playlists: ChannelPlaylist[]
  fetchedAt: string
}

export type ChannelFeedResult = {
  data: ChannelFeedData | null
  error: string | null
  source: "database" | "youtube_api" | "none"
  stale: boolean
}

export type ChannelSnapshotStatus = {
  hasSnapshot: boolean
  fetchedAt: string | null
  stale: boolean
  lastError: string | null
}

function todayUtcKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function isSameUtcDay(isoDate: string | null | undefined, reference = new Date()) {
  if (!isoDate) return false
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return false
  return todayUtcKey(parsed) === todayUtcKey(reference)
}

function buildApiUrl(path: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    search.set(key, String(value))
  }
  return `https://www.googleapis.com/youtube/v3/${path}?${search.toString()}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const data = (await response.json()) as T

  if (!response.ok) {
    throw new Error(`YouTube API error (${response.status})`)
  }

  return data
}

function safeCount(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pickThumb(
  thumbnails:
    | {
        high?: { url?: string }
        medium?: { url?: string }
        default?: { url?: string }
      }
    | undefined
) {
  return thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || ""
}

function parseFeedPayload(payload: unknown): ChannelFeedData | null {
  if (!payload || typeof payload !== "object") return null

  const data = payload as Partial<ChannelFeedData>
  if (!data.channel || !Array.isArray(data.videos) || !Array.isArray(data.playlists)) {
    return null
  }

  return {
    channel: data.channel as ChannelInfo,
    videos: (data.videos as ChannelVideo[]).slice(0, DAILY_SYNC_LIMIT),
    playlists: (data.playlists as ChannelPlaylist[]).slice(0, DAILY_SYNC_LIMIT),
    fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : new Date().toISOString(),
  }
}

async function resolveChannelId(apiKey: string): Promise<string> {
  const directChannelId = process.env.YOUTUBE_CHANNEL_ID?.trim()
  if (directChannelId) return directChannelId

  const handle = process.env.YOUTUBE_CHANNEL_HANDLE?.trim() || "@sunano_"

  const channelUrl = buildApiUrl("channels", {
    part: "id",
    forHandle: handle,
    key: apiKey,
  })

  const channelData = await fetchJson<YouTubeApiListResponse<{ id?: string }>>(channelUrl)
  const channelId = channelData.items?.[0]?.id

  if (!channelId) {
    throw new Error("Canal do YouTube não encontrado")
  }

  return channelId
}

async function fetchLiveFeedFromYouTube(apiKey: string): Promise<ChannelFeedData> {
  const channelId = await resolveChannelId(apiKey)

  const channelInfoUrl = buildApiUrl("channels", {
    part: "snippet,statistics,contentDetails",
    id: channelId,
    key: apiKey,
  })

  const playlistsUrl = buildApiUrl("playlists", {
    part: "snippet",
    channelId,
    maxResults: DAILY_SYNC_LIMIT,
    key: apiKey,
  })

  const [channelData, playlistsData] = await Promise.all([
    fetchJson<YouTubeApiListResponse<YouTubeChannelItem>>(channelInfoUrl),
    fetchJson<YouTubeApiListResponse<YouTubePlaylistItem>>(playlistsUrl),
  ])

  const channelItem = channelData.items?.[0]
  const channelTitle = channelItem?.snippet?.title || "Canal YouTube"
  const customUrl = channelItem?.snippet?.customUrl || null

  // Pega a playlist de uploads do canal (contém todos os vídeos publicados)
  const uploadsPlaylistId = channelItem?.contentDetails?.relatedPlaylists?.uploads

  if (!uploadsPlaylistId) {
    throw new Error("Não foi possível encontrar a playlist de uploads do canal")
  }

  // Busca os vídeos pela playlist de uploads — retorna exatamente 12
  const uploadsUrl = buildApiUrl("playlistItems", {
    part: "snippet",
    playlistId: uploadsPlaylistId,
    maxResults: DAILY_SYNC_LIMIT,
    key: apiKey,
  })

  const uploadsData = await fetchJson<YouTubeApiListResponse<YouTubePlaylistItemResource>>(uploadsUrl)

  const channel: ChannelInfo = {
    id: channelId,
    title: channelTitle,
    description: channelItem?.snippet?.description || "",
    customUrl,
    thumbnailUrl: pickThumb(channelItem?.snippet?.thumbnails),
    subscriberCount: safeCount(channelItem?.statistics?.subscriberCount),
    viewCount: safeCount(channelItem?.statistics?.viewCount),
    videoCount: safeCount(channelItem?.statistics?.videoCount),
    channelUrl: customUrl
      ? `https://www.youtube.com/${customUrl.startsWith("@") ? customUrl : `@${customUrl}`}`
      : `https://www.youtube.com/channel/${channelId}`,
    videosUrl: `https://www.youtube.com/channel/${channelId}/videos`,
    playlistsUrl: `https://www.youtube.com/channel/${channelId}/playlists`,
  }

  const videos: ChannelVideo[] = (uploadsData.items ?? [])
    .map((item) => {
      const videoId = item.snippet?.resourceId?.videoId
      if (!videoId) return null

      const snippet = item.snippet
      return {
        id: videoId,
        title: snippet?.title || "Sem título",
        description: snippet?.description || "",
        publishedAt: snippet?.publishedAt || "",
        thumbnailUrl: pickThumb(snippet?.thumbnails),
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      }
    })
    .filter((item): item is ChannelVideo => Boolean(item))
    .slice(0, DAILY_SYNC_LIMIT)

  const playlists: ChannelPlaylist[] = (playlistsData.items ?? [])
    .map((item) => {
      if (!item.id) return null

      const snippet = item.snippet
      return {
        id: item.id,
        title: snippet?.title || "Sem título",
        description: snippet?.description || "",
        publishedAt: snippet?.publishedAt || "",
        thumbnailUrl: pickThumb(snippet?.thumbnails),
        playlistUrl: `https://www.youtube.com/playlist?list=${item.id}`,
      }
    })
    .filter((item): item is ChannelPlaylist => Boolean(item))
    .slice(0, DAILY_SYNC_LIMIT)

  return {
    channel,
    videos,
    playlists,
    fetchedAt: new Date().toISOString(),
  }
}

async function readSnapshot() {
  const adminClient = createSupabaseAdminClient()
  const { data, error } = await adminClient
    .from("youtube_cache_snapshots")
    .select("cache_key, payload, fetched_at, last_error")
    .eq("cache_key", SNAPSHOT_KEY)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao ler cache no Supabase: ${error.message}`)
  }

  const snapshotRow = data as { payload?: unknown; fetched_at?: string | null; last_error?: string | null } | null
  const parsed = parseFeedPayload(snapshotRow?.payload)

  return {
    fetchedAt: snapshotRow?.fetched_at ?? null,
    lastError: snapshotRow?.last_error ?? null,
    parsedData: parsed,
  }
}

async function writeSnapshot(payload: ChannelFeedData, lastError: string | null) {
  const adminClient = createSupabaseAdminClient()
  const snapshotsTable = adminClient.from("youtube_cache_snapshots") as unknown as {
    upsert: (
      values: {
        cache_key: string
        payload: Record<string, unknown>
        fetched_at: string
        source: string
        last_error: string | null
      },
      options: { onConflict: string }
    ) => PromiseLike<{ error: { message: string } | null }>
  }

  const { error } = await snapshotsTable.upsert(
    {
      cache_key: SNAPSHOT_KEY,
      payload: payload as unknown as Record<string, unknown>,
      fetched_at: payload.fetchedAt,
      source: "youtube_api",
      last_error: lastError,
    },
    { onConflict: "cache_key" }
  )

  if (error) {
    throw new Error(`Erro ao salvar cache no Supabase: ${error.message}`)
  }
}

export async function getYouTubeSnapshotStatus(): Promise<ChannelSnapshotStatus> {
  try {
    const snapshot = await readSnapshot()
    return {
      hasSnapshot: Boolean(snapshot.parsedData),
      fetchedAt: snapshot.fetchedAt,
      stale: !isSameUtcDay(snapshot.fetchedAt),
      lastError: snapshot.lastError,
    }
  } catch (error) {
    return {
      hasSnapshot: false,
      fetchedAt: null,
      stale: true,
      lastError: error instanceof Error ? error.message : "Falha ao carregar status",
    }
  }
}

export async function getYouTubeChannelFeed(options?: {
  forceRefresh?: boolean
}): Promise<ChannelFeedResult> {
  const forceRefresh = Boolean(options?.forceRefresh)
  const apiKey = process.env.YOUTUBE_API_KEY?.trim()

  let snapshot: {
    fetchedAt: string | null
    lastError: string | null
    parsedData: ChannelFeedData | null
  } = {
    fetchedAt: null,
    lastError: null,
    parsedData: null,
  }

  try {
    snapshot = await readSnapshot()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao ler cache"
    return {
      data: null,
      error: message,
      source: "none",
      stale: true,
    }
  }

  const hasFreshSnapshot = Boolean(snapshot.parsedData && isSameUtcDay(snapshot.fetchedAt))

  if (!forceRefresh && hasFreshSnapshot) {
    return {
      data: snapshot.parsedData,
      error: snapshot.lastError,
      source: "database",
      stale: false,
    }
  }

  if (!apiKey) {
    if (snapshot.parsedData) {
      return {
        data: snapshot.parsedData,
        error: "YOUTUBE_API_KEY não definida. Exibindo último snapshot salvo.",
        source: "database",
        stale: true,
      }
    }

    return {
      data: null,
      error: "YOUTUBE_API_KEY não definida.",
      source: "none",
      stale: true,
    }
  }

  try {
    const liveData = await fetchLiveFeedFromYouTube(apiKey)
    await writeSnapshot(liveData, null)

    return {
      data: liveData,
      error: null,
      source: "youtube_api",
      stale: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar snapshot do YouTube"

    if (snapshot.parsedData) {
      return {
        data: snapshot.parsedData,
        error: `${message}. Exibindo último snapshot salvo.`,
        source: "database",
        stale: true,
      }
    }

    return {
      data: null,
      error: message,
      source: "none",
      stale: true,
    }
  }
}