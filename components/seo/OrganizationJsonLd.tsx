import { SOCIAL_LINKS } from "@/lib/social-links"
import { SITE_URL } from "@/lib/site-url"


/**
 * JSON-LD Organization + WebSite, renderizado uma vez no `app/layout.tsx`.
 * O `sameAs` é o sinal padrão que o Google usa para ligar o site às contas
 * oficiais (YouTube, Discord, etc.) — sem isso as buscas pelo nome "Sunano"
 * não associam o site ao canal, mesmo o canal já sendo indexado.
 */
export function OrganizationJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Sunano",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
        sameAs: SOCIAL_LINKS.map((link) => link.href),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Sunano",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "pt-BR",
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
