import { NextResponse } from "next/server"

type TelegramGetFileResponse = {
  ok?: boolean
  result?: {
    file_path?: string
  }
  description?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get("fileId")?.trim()

  if (!fileId) {
    return NextResponse.json({ error: "fileId is required." }, { status: 400 })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!botToken) {
    return NextResponse.json({ error: "Telegram not configured." }, { status: 500 })
  }

  const infoResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  )
  const infoData = (await infoResponse.json().catch(() => null)) as TelegramGetFileResponse | null

  if (!infoResponse.ok || !infoData?.ok || !infoData.result?.file_path) {
    return NextResponse.json(
      { error: infoData?.description ?? "Unable to load Telegram media." },
      { status: 404 }
    )
  }

  const fileResponse = await fetch(`https://api.telegram.org/file/bot${botToken}/${infoData.result.file_path}`)

  if (!fileResponse.ok || !fileResponse.body) {
    return NextResponse.json({ error: "Unable to load Telegram media." }, { status: 404 })
  }

  const headers = new Headers()
  const contentType = fileResponse.headers.get("content-type")
  if (contentType) {
    headers.set("Content-Type", contentType)
  }
  headers.set("Cache-Control", "public, max-age=300, s-maxage=300")

  return new NextResponse(fileResponse.body, { status: 200, headers })
}
