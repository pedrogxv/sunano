"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { enUS, ptBR } from "date-fns/locale"
import { MessageCircle, Plus } from "lucide-react"

import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLocale } from "@/lib/locale-context"

type ForumPost = {
  id: string
  slug: string
  title: string
  body: string
  author_name: string
  created_at: string
  is_locked: boolean
  comment_count: number
}

type PostsResponse = {
  ok?: boolean
  error?: string
  posts?: ForumPost[]
}

const AUTHOR_NAME_KEY = "sunano-forum-author"
const AUTHOR_EMAIL_KEY = "sunano-forum-email"

export default function ForumPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [authorName, setAuthorName] = useState("")
  const [authorEmail, setAuthorEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const storedName = typeof window !== "undefined" ? localStorage.getItem(AUTHOR_NAME_KEY) : null
    const storedEmail = typeof window !== "undefined" ? localStorage.getItem(AUTHOR_EMAIL_KEY) : null
    if (storedName) setAuthorName(storedName)
    if (storedEmail) setAuthorEmail(storedEmail)
  }, [])

  useEffect(() => {
    loadPosts()
  }, [])

  async function loadPosts() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/forum/posts")
      const data = (await response.json().catch(() => null)) as PostsResponse | null

      if (!response.ok || !data?.posts) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load forum posts" : "Erro ao carregar posts"))
      }

      setPosts(data.posts)
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load forum posts" : "Erro ao carregar posts"))
    } finally {
      setLoading(false)
    }
  }

  async function submitPost() {
    try {
      setSaving(true)
      setFormError(null)

      const response = await fetch("/api/forum/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          author_name: authorName,
          author_email: authorEmail || undefined,
          website: "",
        }),
      })

      const data = (await response.json().catch(() => null)) as { error?: string; ok?: boolean; slug?: string } | null

      if (!response.ok || !data?.ok || !data.slug) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to create post" : "Erro ao criar post"))
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(AUTHOR_NAME_KEY, authorName)
        if (authorEmail) {
          localStorage.setItem(AUTHOR_EMAIL_KEY, authorEmail)
        }
      }

      setTitle("")
      setBody("")

      await loadPosts()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : (isEnglish ? "Failed to create post" : "Erro ao criar post"))
    } finally {
      setSaving(false)
    }
  }

  const dateLocale = isEnglish ? enUS : ptBR

  const postItems = useMemo(() => posts, [posts])

  return (

    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-50 md:text-4xl">
          {isEnglish ? "Community Forum" : "Forum da comunidade"}
        </h1>
        <p className="text-sm text-slate-400">
          {isEnglish
            ? "Share tips, ask for help, and discuss peripherals."
            : "Compartilhe dicas, tire duvidas e discuta periféricos."}
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base text-slate-50">
            <Plus className="size-4 text-cyan-300" />
            {isEnglish ? "Start a new topic" : "Criar novo topico"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formError ? (
            <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
              <AlertDescription className="text-xs leading-5 text-red-200">{formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {isEnglish ? "Your name" : "Seu nome"}
              </label>
              <Input
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                className="border-white/10 bg-white/[0.03] text-slate-100"
                placeholder={isEnglish ? "Ex: Ana" : "Ex: Ana"}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {isEnglish ? "Email (optional)" : "Email (opcional)"}
              </label>
              <Input
                value={authorEmail}
                onChange={(event) => setAuthorEmail(event.target.value)}
                className="border-white/10 bg-white/[0.03] text-slate-100"
                placeholder="email@exemplo.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {isEnglish ? "Title" : "Titulo"}
            </label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="border-white/10 bg-white/[0.03] text-slate-100"
              placeholder={isEnglish ? "Ex: Best wireless mouse under $100" : "Ex: Melhor mouse sem fio ate R$500"}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {isEnglish ? "Message" : "Mensagem"}
            </label>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-[140px] border-white/10 bg-white/[0.03] text-slate-100"
              placeholder={isEnglish ? "Tell us what you need..." : "Conte o que voce precisa..."}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={submitPost} disabled={saving}>
              {saving ? (isEnglish ? "Publishing..." : "Publicando...") : (isEnglish ? "Publish" : "Publicar")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertDescription className="text-xs leading-5 text-red-200">{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-400">{isEnglish ? "Loading forum..." : "Carregando forum..."}</div>
      ) : postItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-slate-300">{isEnglish ? "No topics yet." : "Nenhum topico ainda."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {postItems.map((post) => (
            <Card key={post.id} className="border-border bg-card">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Link href={`/forum/${post.slug}`} className="text-base font-semibold text-slate-50 hover:text-cyan-200">
                      {post.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {format(new Date(post.created_at), "PPp", { locale: dateLocale })} · {post.author_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs text-slate-300">
                    <MessageCircle className="size-3" />
                    {post.comment_count}
                  </div>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {post.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
