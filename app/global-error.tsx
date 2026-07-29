"use client"

// Fallback de último recurso: só é usado quando o root layout em si quebra.
// Por isso não depende de providers, i18n, Tailwind ou next/image — nada que
// tenha passado pela árvore que acabou de falhar. Estilo inline, HTML puro.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          backgroundColor: "#09090b",
          color: "#fafafa",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/mascot/mascot-warning.png"
          alt="Mascote do Sunano segurando uma placa de atenção"
          width={160}
          height={160}
          style={{
            width: 160,
            height: 160,
            objectFit: "contain",
            borderRadius: "32px",
            backgroundColor: "#000000",
          }}
        />
        <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
          Ops, alguma coisa quebrou de vez
        </h1>
        <p style={{ fontSize: "14px", color: "#a1a1aa", maxWidth: "380px", margin: 0 }}>
          Não conseguimos carregar o site agora. Tente recarregar a página em alguns instantes.
        </p>
        {error.digest && (
          <p style={{ fontSize: "12px", color: "#71717a", fontFamily: "monospace", margin: 0 }}>
            Código do erro: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#fafafa",
              color: "#09090b",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
          {/* <a> proposital: se o root layout quebrou, o roteador client-side do
              Next pode estar num estado ruim — um reload completo é mais confiável
              que uma navegação via <Link>. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #27272a",
              color: "#fafafa",
              fontSize: "14px",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Voltar para a Home
          </a>
        </div>
      </body>
    </html>
  )
}
