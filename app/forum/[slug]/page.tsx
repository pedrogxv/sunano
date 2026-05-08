"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { enUS, ptBR } from "date-fns/locale"
import { ChevronLeft, MessageCircle } from "lucide-react"

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
}

type ForumComment = {
  id: string
  body: string
  author_name: string
  created_at: string
}

type PostResponse = {
  ok?: boolean
  error?: string
  post?: ForumPost
  comments?: ForumComment[]
}

const AUTHOR_NAME_KEY = "sunano-forum-author"
const AUTHOR_EMAIL_KEY = "sunano-forum-email"

export default function ForumPostPage() {
  const params = useParams<{ slug: string }>()
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [authorName, setAuthorName] = useState("")
  const [authorEmail, setAuthorEmail] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const storedName = typeof window !== "undefined" ? localStorage.getItem(AUTHOR_NAME_KEY) : null
    const storedEmail = typeof window !== "undefined" ? localStorage.getItem(AUTHOR_EMAIL_KEY) : null
    if (storedName) setAuthorName(storedName)
    if (storedEmail) setAuthorEmail(storedEmail)
  }, [])

  useEffect(() => {
    loadPost()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug])

  async function loadPost() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/forum/posts/${params.slug}`)
      const data = (await response.json().catch(() => null)) as PostResponse | null

      if (!response.ok || !data?.post) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load post" : "Erro ao carregar post"))
      }

      setPost(data.post)
      setComments(data.comments ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load post" : "Erro ao carregar post"))
    } finally {
      setLoading(false)
    }
  }

  async function submitComment() {
    if (!post) return

    try {
      setSaving(true)
      setFormError(null)

      const response = await fetch(`/api/forum/posts/${post.slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          author_name: authorName,
          author_email: authorEmail || undefined,
          website: "",
        }),
      })

      const data = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to send comment" : "Erro ao enviar comentario"))
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(AUTHOR_NAME_KEY, authorName)
        if (authorEmail) {
          localStorage.setItem(AUTHOR_EMAIL_KEY, authorEmail)
        }
      }

      setBody("")
      await loadPost()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : (isEnglish ? "Failed to send comment" : "Erro ao enviar comentario"))
    } finally {
      setSaving(false)
    }
  }

  const dateLocale = isEnglish ? enUS : ptBR

  return (

    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 lg:px-8">
      <Button asChild variant="ghost" className="gap-2 text-slate-300 hover:text-slate-50">
        <Link href="/forum">
          <ChevronLeft className="size-4" />
          {isEnglish ? "Back to forum" : "Voltar ao forum"}
        </Link>
      </Button>

      {error ? (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertDescription className="text-xs leading-5 text-red-200">{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-400">{isEnglish ? "Loading post..." : "Carregando post..."}</div>
      ) : post ? (
        <>
          <Card className="border-border bg-card">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl text-slate-50">{post.title}</CardTitle>
              <p className="text-xs text-slate-500">
                {format(new Date(post.created_at), "PPp", { locale: dateLocale })} · {post.author_name}
              </p>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{post.body}</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base text-slate-50">
                <MessageCircle className="size-4 text-cyan-300" />
                {isEnglish ? "Comments" : "Comentarios"} ({comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-sm text-slate-400">{isEnglish ? "No comments yet." : "Nenhum comentario ainda."}</p>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                      <p className="text-xs text-slate-500">
                        {format(new Date(comment.created_at), "PPp", { locale: dateLocale })} · {comment.author_name}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base text-slate-50">
                {post.is_locked ? (isEnglish ? "Comments closed" : "Comentarios fechados") : (isEnglish ? "Leave a comment" : "Deixe um comentario")}
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
                    disabled={post.is_locked}
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
                    disabled={post.is_locked}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {isEnglish ? "Message" : "Mensagem"}
                </label>
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-[120px] border-white/10 bg-white/[0.03] text-slate-100"
                  placeholder={isEnglish ? "Write your comment..." : "Escreva seu comentario..."}
                  disabled={post.is_locked}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={submitComment} disabled={saving || post.is_locked}>
                  {saving ? (isEnglish ? "Sending..." : "Enviando...") : (isEnglish ? "Send comment" : "Enviar comentario")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>

  )
}
