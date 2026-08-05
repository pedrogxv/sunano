import { revalidatePath } from "next/cache"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Check, Flag, X } from "lucide-react"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { listForumReportsForModeration, setForumReportStatus } from "@/lib/server/repositories/forum-repository"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const PAGE_SIZE = 20

type FilterKey = "all" | "pending" | "reviewed" | "dismissed"

async function markReviewed(reportId: string) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return
  await setForumReportStatus(reportId, "reviewed")
  revalidatePath("/admin/forum/denuncias")
}

async function markDismissed(reportId: string) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_write")) return
  await setForumReportStatus(reportId, "dismissed")
  revalidatePath("/admin/forum/denuncias")
}

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "Todas",
  pending: "Pendentes",
  reviewed: "Revisadas",
  dismissed: "Descartadas",
}

const STATUS_BADGE: Record<Exclude<FilterKey, "all">, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  reviewed: "bg-emerald-500/15 text-emerald-400",
  dismissed: "bg-muted text-muted-foreground",
}

export default async function AdminForumReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>
}) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "forum_read")) {
    redirect("/admin/forum")
  }

  const params = await searchParams
  const filter = (["all", "pending", "reviewed", "dismissed"].includes(params.filter ?? "")
    ? params.filter
    : "pending") as FilterKey
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const canWrite = hasAdminPermission(auth.profile, "forum_write")

  const { reports, total } = await listForumReportsForModeration({ status: filter, page, pageSize: PAGE_SIZE })
  const totalPages = Math.ceil(total / PAGE_SIZE)

  function buildUrl(overrides: Partial<{ page: number; filter: FilterKey }>) {
    const p = new URLSearchParams()
    const f = overrides.filter ?? filter
    const newPage = overrides.page ?? 1
    if (f !== "pending") p.set("filter", f)
    if (newPage > 1) p.set("page", String(newPage))
    const qs = p.toString()
    return `/admin/forum/denuncias${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin/forum" parentLabel="Moderação" currentLabel="Denúncias" />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Denúncias do Fórum</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Posts e comentários denunciados pela comunidade.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", "pending", "reviewed", "dismissed"] as FilterKey[]).map((f) => (
          <Link
            key={f}
            href={buildUrl({ filter: f, page: 1 })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-border/70 hover:text-foreground"
            }`}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {total} denúncia{total !== 1 ? "s" : ""} encontrada{total !== 1 ? "s" : ""}
      </p>

      <div className="space-y-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Flag className="size-3" />
                    {report.target_type === "post" ? "Post" : "Comentário"}
                  </Badge>
                  <Badge variant="secondary" className={`text-[10px] ${STATUS_BADGE[report.status]}`}>
                    {FILTER_LABELS[report.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    denunciado por {report.reporter_name} · {new Date(report.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs text-foreground">
                  {report.target_type === "comment" ? report.comment_body : report.post_preview}
                </p>
                {report.post_slug && (
                  <Link
                    href={`/forum/${report.post_slug}`}
                    target="_blank"
                    className="mt-1.5 inline-block text-xs text-primary hover:underline"
                  >
                    Ver post original →
                  </Link>
                )}
              </div>

              {canWrite && report.status === "pending" && (
                <div className="flex shrink-0 gap-2">
                  <form action={markReviewed.bind(null, report.id)}>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border text-xs" title="Marcar como revisado">
                      <Check className="size-3.5" />
                      Revisado
                    </Button>
                  </form>
                  <form action={markDismissed.bind(null, report.id)}>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" title="Descartar denúncia">
                      <X className="size-3.5" />
                      Descartar
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ))}

        {reports.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma denúncia encontrada.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {total} denúncias
          </p>
          <div className="flex gap-1.5">
            {page > 1 && (
              <Link href={buildUrl({ page: page - 1 })}>
                <Button size="sm" variant="outline" className="h-8 border-border text-xs">Anterior</Button>
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildUrl({ page: page + 1 })}>
                <Button size="sm" variant="outline" className="h-8 border-border text-xs">Próxima</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
