const isDev = process.env.NODE_ENV !== "production"

// Next.js precisa de 'unsafe-inline' para os scripts de bootstrap/hydration
// e 'unsafe-eval' só em dev (HMR/Fast Refresh). Migrar para nonce/strict-dynamic
// removeria o 'unsafe-inline', MAS a doc do Next 16 (node_modules/next/dist/
// docs/01-app/02-guides/content-security-policy.md) é explícita: nonce força
// TODA página a renderizar dinamicamente — mata SSG/ISR/PPR e o cache de CDN.
// Este site depende de páginas estáticas indexáveis (fórum/blog/notícias) e de
// cache por custo (ver otimizações de 2026-08/09), então nonce sairia caro
// demais. Mitigação equivalente sem regressão: o roubo de sessão por
// 'unsafe-inline' só se concretiza com um XSS, e todo conteúdo de usuário é
// sanitizado/reassinado no servidor (comment-media.ts, support-media.ts) ou
// renderizado como texto pelo React; hrefs de URL externa passam por
// `safeHref` (lib/safe-url.ts). `upgrade-insecure-requests` fecha mixed content.
const csp = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	// api.klipy.com: o seletor de GIF chama o KLIPY direto do browser (exigência
	// deles — sem proxy). static*.klipy.com serve as miniaturas via <img> (já
	// coberto por img-src https:), mas o share trigger é um POST → connect-src.
	`connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://api.klipy.com${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
	"frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'",
	// Sem 'unsafe-inline' pra atributos on*=... inline nem <a href="javascript:">
	// (a diretiva script-src-attr não herda de script-src): fecha a superfície
	// de handler inline mesmo que algum HTML injetado escape.
	"script-src-attr 'none'",
	...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
	{ key: "Content-Security-Policy", value: csp },
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
	{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Tira o `X-Powered-By: Next.js` das respostas: não muda nada para o site
	// e só entrega a stack de graça para quem faz reconhecimento.
	poweredByHeader: false,
	experimental: {
		// `proxy.ts` casa com `/api/*`, e o Next bufferiza em memória o corpo de
		// toda request que passa por proxy. No padrão (10MB) um upload maior não
		// falha: o corpo é TRUNCADO, um aviso é logado e a rota segue rodando com
		// o arquivo cortado — gravaria imagem corrompida no bucket sem erro
		// nenhum. Este valor precisa ficar acima do maior teto de
		// `lib/upload-limits.ts` (o par está documentado lá).
		proxyClientMaxBodySize: "24mb",
	},
	// Typecheck roda no GitHub Actions (.github/workflows/typecheck.yml) em
	// paralelo ao build, não dentro dele — evita pagar os ~25s de `tsc` a
	// cada deploy na Vercel. Sem isso, é a única rede de segurança contra
	// erro de tipo indo pro ar, então não desativar sem CI equivalente.
	typescript: {
		ignoreBuildErrors: true,
	},
	images: {
		// Redimensionamento sai do otimizador da Vercel e passa a ser feito pelo
		// Supabase Storage — ver lib/image-loader.ts. A cota de transformações da
		// Vercel estourou e `/_next/image` passou a responder 402, quebrando toda
		// imagem ainda não cacheada (o cache de 31 dias disfarçava, porque só o
		// que era enviado depois quebrava).
		loader: "custom",
		loaderFile: "./lib/image-loader.ts",
		// `formats`, `minimumCacheTTL` e `remotePatterns` só valem para o
		// otimizador nativo, que deixou de ser usado. Ficam registrados para o
		// caso de o loader ser revertido.
		formats: ["image/webp"],
		minimumCacheTTL: 2678400, // 31 dias
		remotePatterns: [
			{
				protocol: "https",
				hostname: "pwbkzjknstbqqemqyppm.supabase.co",
				pathname: "/storage/v1/object/public/**",
			},
			// Capas de fallback do blog/notícias.
			{ protocol: "https", hostname: "images.unsplash.com" },
			// GIFs do seletor (KLIPY) anexados a comentários/posts — servidos de
			// static*.klipy.com (ver lib/klipy.ts e docs.klipy.com/network-requirements).
			{ protocol: "https", hostname: "static.klipy.com" },
			{ protocol: "https", hostname: "static1.klipy.com" },
			{ protocol: "https", hostname: "static2.klipy.com" },
			// Thumbnails do YouTube (feed de vídeos).
			{ protocol: "https", hostname: "i.ytimg.com" },
			{ protocol: "https", hostname: "img.youtube.com" },
			// Avatar padrão (github.com/shadcn.png) usado como fallback.
			{ protocol: "https", hostname: "github.com" },
			{ protocol: "https", hostname: "avatars.githubusercontent.com" },
			// Fotos de perfil vindas do login social. Os dois provedores de
			// OAuthButton.tsx precisam estar aqui: um host faltando não degrada,
			// derruba com erro a página inteira que renderizar aquele avatar.
			{ protocol: "https", hostname: "lh3.googleusercontent.com" },
			{ protocol: "https", hostname: "cdn.discordapp.com" },
		],
	},
	async headers() {
		return [
			{
				source: "/:path*",
				headers: securityHeaders,
			},
		]
	},
	async redirects() {
		return [
			// /eventos virou /conquistas (a área admin continua em /admin/eventos).
			{ source: "/eventos", destination: "/conquistas", permanent: true },
			{ source: "/api/eventos/:path*", destination: "/api/conquistas/:path*", permanent: true },
		]
	},
}

export default nextConfig
