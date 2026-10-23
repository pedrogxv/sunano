/**
 * Upload com progresso de verdade. `fetch` não expõe o progresso do ENVIO
 * (só o da resposta), então quem quer barra de 0 a 100% precisa de
 * `XMLHttpRequest`, cujo `upload.onprogress` conta os bytes que saíram.
 *
 * Além dos bytes, calcula a velocidade (média móvel exponencial, para não
 * pular a cada pacote) e o tempo restante a partir dela. Sem a média, o ETA
 * oscila entre "2s" e "40s" na mesma conexão e a barra mente.
 */

export type UploadProgress = {
  loaded: number
  total: number
  /** 0–1. */
  fraction: number
  /** Bytes por segundo, suavizado. `null` nos primeiros instantes, enquanto não há amostra. */
  bytesPerSecond: number | null
  /** Segundos até terminar o envio. `null` enquanto a velocidade não estabiliza. */
  etaSeconds: number | null
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Corpo da resposta já lido como JSON, quando houver. */
    readonly body: unknown = null
  ) {
    super(message)
  }
}

export class UploadAbortedError extends Error {
  constructor() {
    super("Envio cancelado")
  }
}

/** Peso da amostra nova na média de velocidade: mais alto reage rápido, mais baixo estabiliza. */
const SPEED_SMOOTHING = 0.2
/** Antes disso a média só usa bytes/tempo total: as primeiras amostras são ruído de buffer. */
const WARMUP_MS = 800
/** Sem nenhum byte novo por esse tempo, a conexão caiu: falha em vez de "Enviando..." para sempre. */
const STALL_TIMEOUT_MS = 30_000
/**
 * Depois do último byte, quanto esperar a resposta. O Storage ainda grava o
 * objeto antes de responder, mas isso leva segundos, não minutos.
 */
const RESPONSE_TIMEOUT_MS = 90_000

type UploadOptions = {
  method: "POST" | "PUT"
  url: string
  body: XMLHttpRequestBodyInit
  headers?: Record<string, string>
  signal?: AbortSignal
  onProgress?: (progress: UploadProgress) => void
  /** Disparado quando o último byte saiu e o servidor ainda está processando. */
  onUploaded?: () => void
}

/** Envia e devolve o corpo da resposta (JSON se der, texto se não). */
export function uploadWithProgress<T = unknown>({
  method,
  url,
  body,
  headers,
  signal,
  onProgress,
  onUploaded,
}: UploadOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadAbortedError())
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [name, value] of Object.entries(headers ?? {})) xhr.setRequestHeader(name, value)

    const startedAt = performance.now()
    let lastAt = startedAt
    let lastLoaded = 0
    let speed: number | null = null
    let stallTimer: ReturnType<typeof setTimeout> | null = null

    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        stalled = "O envio parou de avançar. Confira a conexão e tente de novo"
        xhr.abort()
      }, STALL_TIMEOUT_MS)
    }
    let stalled: string | null = null
    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer)
      signal?.removeEventListener("abort", onAbort)
    }
    const onAbort = () => xhr.abort()
    signal?.addEventListener("abort", onAbort)

    xhr.upload.onprogress = (event) => {
      armStallTimer()
      const now = performance.now()
      const total = event.lengthComputable ? event.total : 0
      const elapsed = now - startedAt

      if (elapsed < WARMUP_MS) {
        speed = elapsed > 0 ? (event.loaded / elapsed) * 1000 : null
      } else {
        const dt = (now - lastAt) / 1000
        if (dt > 0) {
          const instant = (event.loaded - lastLoaded) / dt
          speed = speed === null ? instant : speed + SPEED_SMOOTHING * (instant - speed)
        }
      }
      lastAt = now
      lastLoaded = event.loaded

      const remaining = Math.max(0, total - event.loaded)
      onProgress?.({
        loaded: event.loaded,
        total,
        fraction: total > 0 ? event.loaded / total : 0,
        bytesPerSecond: speed,
        etaSeconds: elapsed >= WARMUP_MS && speed && speed > 0 ? remaining / speed : null,
      })
    }
    xhr.upload.onload = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        stalled = "O arquivo foi enviado, mas o servidor não respondeu. Tente de novo"
        xhr.abort()
      }, RESPONSE_TIMEOUT_MS)
      onUploaded?.()
    }
    xhr.upload.onloadstart = armStallTimer

    xhr.onload = () => {
      cleanup()
      let parsed: unknown = xhr.responseText
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null
      } catch {
        // Resposta não-JSON (ex.: "Request Entity Too Large" do proxy): fica o texto.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as T)
        return
      }
      const fields = parsed && typeof parsed === "object" ? (parsed as { error?: unknown; message?: unknown }) : {}
      // Nossas rotas mandam `error`; o Storage manda `error` genérico e o motivo em `message`.
      const message =
        (typeof fields.message === "string" && fields.message) ||
        (typeof fields.error === "string" && fields.error) ||
        `Falha no envio (HTTP ${xhr.status})`
      reject(new UploadError(message, xhr.status, parsed))
    }
    xhr.onerror = () => {
      cleanup()
      reject(new UploadError("A conexão caiu durante o envio", 0))
    }
    xhr.onabort = () => {
      cleanup()
      // Os timers abortam pelo mesmo caminho do cancelar; `stalled` separa
      // "o usuário cancelou" de "a rede/o servidor morreu".
      reject(stalled ? new UploadError(stalled, 0) : new UploadAbortedError())
    }

    xhr.send(body)
  })
}

/** "12,4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`
}

/** "~12 s restantes", "~1 min 05 s restantes". Arredonda para cima: prometer menos e atrasar é pior. */
export function formatEta(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds))
  if (s < 60) return `~${s} s restantes`
  const min = Math.floor(s / 60)
  const rest = s % 60
  return `~${min} min ${String(rest).padStart(2, "0")} s restantes`
}
