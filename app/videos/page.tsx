import Link from "next/link"
import { ExternalLink, PlayCircle } from "lucide-react"

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

export default async function VideosPage() {
  const { data: feed, error } = await getYouTubeChannelFeed({ forceRefresh: true })

  const videos = feed?.videos ?? []
  const channel = feed?.channel ?? null

  return (

    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-border bg-background p-5 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              Vídeos
            </Badge>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Últimos vídeos e redes sociais
            </h1>
          </div>

          {channel ? (
            <Card className="w-full max-w-sm border-border bg-background">
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
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-border bg-background text-foreground transition-colors hover:bg-muted"
                  >
                    <Link href={channel.channelUrl} target="_blank" rel="noreferrer">
                        YouTube
                      <ExternalLink className="size-4 ml-2" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-border bg-background text-foreground transition-colors hover:bg-muted"
                  >
                    <Link href="https://www.tiktok.com/@_sunano" target="_blank" rel="noreferrer">
                      TikTok
                      <ExternalLink className="size-4 ml-2" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-border bg-background text-foreground transition-colors hover:bg-muted"
                  >
                    <Link href="https://x.com/_sunan0" target="_blank" rel="noreferrer">
                      X
                      <ExternalLink className="size-4 ml-2" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-border bg-background text-foreground transition-colors hover:bg-muted"
                  >
                    <Link href="https://www.instagram.com/sunano.gg?igsh=NWk0ZnQ1dXg2aWxw" target="_blank" rel="noreferrer">
                      Instagram
                      <ExternalLink className="size-4 ml-2" />
                    </Link>
                  </Button>
                </div>
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
            <h2 className="text-xl font-semibold text-foreground">Últimos 12 vídeos</h2>
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
            {videos.slice(0, 12).map((video) => (
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

      
    </div>
  )
}
