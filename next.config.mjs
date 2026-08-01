const isDev = process.env.NODE_ENV !== "production"

// Next.js precisa de 'unsafe-inline' para os scripts de bootstrap/hydration
// e 'unsafe-eval' só em dev (HMR/Fast Refresh). Sem nonce/strict-dynamic por
// enquanto — adotar isso exigiria instrumentar nonce em cada response.
const csp = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	`connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
	"frame-src https://www.youtube.com https://www.youtube-nocookie.com https://checkout.stripe.com",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self' https://checkout.stripe.com",
	"frame-ancestors 'self'",
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
}

export default nextConfig
