import Link from "next/link"
import { ExternalLink, ListVideo, PlayCircle, Users, Video } from "lucide-react"

import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getYouTubeChannelFeed } from "@/lib/youtube"

function formatDate(value: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatCount(value: number | null) {
  if (value === null) return "-"
  return new Intl.NumberFormat("pt-BR").format(value)
}

export default async function VideosPage() {
  const { data: feed, error } = await getYouTubeChannelFeed()

  const videos = feed?.videos ?? []
  const playlists = feed?.playlists ?? []
  const channel = feed?.channel ?? null

  return (
    <div className="flex min-h-screen bg-background pt-16 text-foreground">
      <div className="hidden shrink-0 md:sticky md:top-16 md:flex md:h-[calc(100vh-64px)]">
        <PublicSidebar />
      </div>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6 lg:px-8">
          <section className="overflow-hidden rounded-2xl border border-border bg-card p-5 [background-image:radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_40%)] md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                  Vídeos
                </Badge>
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                  Últimos vídeos e playlists
                </h1>
              </div>

              {channel ? (
                <Card className="w-full max-w-sm border-border bg-muted/30">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      {channel.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={channel.thumbnailUrl}
                          alt={channel.title}
                          className="size-12 rounded-full border border-border object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{channel.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{channel.customUrl || "Canal no YouTube"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-border bg-muted/30 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inscritos</p>
                        <p className="text-sm font-semibold text-foreground">{formatCount(channel.subscriberCount)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Views</p>
                        <p className="text-sm font-semibold text-foreground">{formatCount(channel.viewCount)}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 px-2 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Vídeos</p>
                        <p className="text-sm font-semibold text-foreground">{formatCount(channel.videoCount)}</p>
                      </div>
                    </div>
                    <Button asChild className="w-full bg-red-500 text-white-950 hover:bg-red-500">
                      <Link href={channel.channelUrl} target="_blank" rel="noreferrer">
                        Ver canal no YouTube
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </section>

          {!process.env.YOUTUBE_API_KEY ? (
              <Card className="border-amber-400/30 bg-amber-500/10">
              <CardContent className="py-5 text-sm text-amber-100">
                Defina YOUTUBE_API_KEY no ambiente para habilitar o carregamento automático de vídeos e playlists.
              </CardContent>
            </Card>
          ) : null}

          {error ? (
              <Card className="border-red-400/30 bg-red-500/10">
              <CardContent className="py-5 text-sm text-red-100">
                Não foi possível carregar os dados do YouTube agora: {error}
              </CardContent>
            </Card>
          ) : null}

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PlayCircle className="size-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Últimos 6 vídeos</h2>
              </div>
              {channel ? (
                <Button asChild variant="outline" className="border-border bg-muted/40 text-foreground hover:bg-muted/60">
                  <Link href={channel.videosUrl} target="_blank" rel="noreferrer">
                    Ver todos os vídeos
                    <ExternalLink className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {videos.length === 0 ? (
              <Card className="border-border bg-card">
                <CardContent className="py-7 text-sm text-muted-foreground">Nenhum vídeo encontrado no momento.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {videos.slice(0, 6).map((video) => (
                  <Link key={video.id} href={video.watchUrl} target="_blank" rel="noreferrer" className="block">
                    <Card className="h-full overflow-hidden border-border bg-card transition-colors hover:border-primary/50">
                      {video.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={video.thumbnailUrl} alt={video.title} className="h-40 w-full object-cover" />
                      ) : null}
                      <CardHeader className="space-y-1.5">
                        <CardTitle className="line-clamp-2 text-sm text-foreground md:text-base">{video.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">{formatDate(video.publishedAt)}</p>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{video.description || "Sem descrição"}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ListVideo className="size-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Playlists do canal</h2>
              </div>
              {channel ? (
                <Button asChild variant="outline" className="border-border bg-muted/40 text-foreground hover:bg-muted/60">
                  <Link href={channel.playlistsUrl} target="_blank" rel="noreferrer">
                    Ver todas as playlists
                    <ExternalLink className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {playlists.length === 0 ? (
              <Card className="border-border bg-card">
                <CardContent className="py-7 text-sm text-muted-foreground">Nenhuma playlist encontrada no momento.</CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {playlists.slice(0, 6).map((playlist) => (
                  <Link key={playlist.id} href={playlist.playlistUrl} target="_blank" rel="noreferrer" className="block">
                    <Card className="h-full overflow-hidden border-border bg-card transition-colors hover:border-primary/50">
                      {playlist.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={playlist.thumbnailUrl} alt={playlist.title} className="h-40 w-full object-cover" />
                      ) : null}
                      <CardHeader className="space-y-1.5">
                        <CardTitle className="line-clamp-2 text-sm text-foreground md:text-base">{playlist.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">{formatDate(playlist.publishedAt)}</p>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{playlist.description || "Sem descrição"}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <div className="md:hidden">
        <PublicSidebar />
      </div>
    </div>
  )
}
