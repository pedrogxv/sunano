import Link from "next/link"
import Image from "next/image"
import { ExternalLink, PlayCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getYouTubeChannelFeed } from "@/lib/server/integrations/youtube"

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

export const revalidate = 300

export default async function VideosPage() {
  const { data: feed, error } = await getYouTubeChannelFeed({ forceRefresh: false })

  const videos = feed?.videos ?? []
  const channel = feed?.channel ?? null

  const channelAvatar = "/images/mascot/sunano-icon.png"

  const socialLinks = channel
    ? [
        { label: "YouTube", href: channel.channelUrl },
        { label: "TikTok", href: "https://www.tiktok.com/@_sunano" },
        { label: "X", href: "https://x.com/_sunan0" },
        { label: "Instagram", href: "https://www.instagram.com/sunano.gg?igsh=NWk0ZnQ1dXg2aWxw" },
      ]
    : []

  return (

    <div className="mx-auto max-w-6xl space-y-6 px-3 py-4 sm:px-4 sm:py-6 md:space-y-8 md:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-border bg-background p-4 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-5">
          <div className="space-y-2 md:space-y-3">
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              Vídeos
            </Badge>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-4xl">
              Últimos vídeos e redes sociais
            </h1>
          </div>

          {channel ? (
            <Card size="sm" className="w-full border-border bg-background md:max-w-sm">
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Image
                    src={channelAvatar}
                    alt={channel.title}
                    width={48}
                    height={48}
                    className="size-9 shrink-0 object-contain md:size-12"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{channel.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{channel.customUrl || "Canal no YouTube"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {socialLinks.map((social) => (
                    <Button
                      key={social.label}
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-full border-border bg-background text-foreground transition-colors hover:bg-muted"
                    >
                      <Link href={social.href} target="_blank" rel="noreferrer">
                        {social.label}
                        <ExternalLink className="ml-1.5 size-3.5" />
                      </Link>
                    </Button>
                  ))}
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

      <section className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PlayCircle className="size-4 text-primary md:size-5" />
            <h2 className="text-base font-semibold text-foreground md:text-xl">Últimos 12 vídeos</h2>
          </div>
          {channel ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="shrink-0 border-border bg-muted/40 text-foreground hover:bg-muted/60"
            >
              <Link href={channel.videosUrl} target="_blank" rel="noreferrer">
                <span className="md:hidden">Ver todos</span>
                <span className="hidden md:inline">Ver todos os vídeos</span>
                <ExternalLink className="size-3.5 md:size-4" />
              </Link>
            </Button>
          ) : null}
        </div>

        {videos.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-7 text-sm text-muted-foreground">Nenhum vídeo encontrado no momento.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {videos.slice(0, 12).map((video) => (
              <Link key={video.id} href={video.watchUrl} target="_blank" rel="noreferrer" className="group block">
                {/* Layout do app do YouTube: thumb full-width em 16:9, e abaixo o
                    avatar do canal ao lado do título + metadados. */}
                <article className="flex h-full flex-col gap-3">
                  {video.thumbnailUrl ? (
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                      <Image
                        src={video.thumbnailUrl}
                        alt={video.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 384px"
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="flex gap-3">
                    <Image
                      src={channelAvatar}
                      alt={channel?.title || "Canal"}
                      width={36}
                      height={36}
                      className="size-9 shrink-0 rounded-full bg-background object-contain p-0.5"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                        {video.title}
                      </h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {channel?.title ? `${channel.title} • ` : ""}
                        {formatDate(video.publishedAt)}
                      </p>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>

      
    </div>
  )
}
