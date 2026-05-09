import { NextResponse } from "next/server"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/admin-auth"
import { getYouTubeChannelFeed, getYouTubeSnapshotStatus } from "@/lib/youtube"

export async function GET() {
  try {
    const auth = await getAuthorizedProfile()
    if (!auth.profile) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!hasAdminPermission(auth.profile, "settings_read")) {
      return NextResponse.json({ error: "Sem permissão para visualizar o status de vídeos." }, { status: 403 })
    }

    const status = await getYouTubeSnapshotStatus()
    return NextResponse.json({ ok: true, status })
  } catch {
    return NextResponse.json({ error: "Erro ao consultar status do snapshot de vídeos." }, { status: 500 })
  }
}

export async function POST() {
  try {
    const auth = await getAuthorizedProfile()
    if (!auth.profile) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!hasAdminPermission(auth.profile, "settings_write")) {
      return NextResponse.json({ error: "Sem permissão para forçar atualização de vídeos." }, { status: 403 })
    }

    const result = await getYouTubeChannelFeed({ forceRefresh: true })

    if (!result.data && result.error) {
      return NextResponse.json(
        {
          error: result.error,
          status: await getYouTubeSnapshotStatus(),
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      warning: result.error,
      source: result.source,
      stale: result.stale,
      status: await getYouTubeSnapshotStatus(),
    })
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar snapshot de vídeos." }, { status: 500 })
  }
}
