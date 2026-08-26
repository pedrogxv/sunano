import Link from "next/link"
import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Quem Somos",
  socialTitle: "Quem Somos: por trás da Sunano",
  description: "Quem é o vendedor responsável pela Loja Sunano, dados da empresa e os canais oficiais de atendimento ao consumidor.",
  path: "/quem-somos",
  eyebrow: "Institucional",
  subtitle: "Identificação e atendimento",
})

export default function QuemSomosPage() {
  return (
    <article className="mx-auto max-w-3xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Quem Somos
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Identificação do vendedor
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Informações exigidas pelo Decreto 7.962/2013 (Lei do E-commerce) para toda loja virtual
          brasileira.
        </p>
      </header>

      <div className="prose prose-sm prose-invert max-w-none space-y-8 text-foreground/90 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:space-y-1 [&_li]:text-sm">

        <section>
          <h2>Sobre o Sunano</h2>
          <p>
            O Sunano é uma plataforma de tierlist, reviews e comunidade de periféricos gamer que
            também opera um Mercado de produtos novos e usados. A operação comercial é
            conduzida por um{" "}
            <abbr title="Microempreendedor Individual">MEI</abbr> (Microempreendedor Individual).
          </p>
        </section>

        <section>
          <h2>Dados cadastrais</h2>
          <p>
            Nome fantasia: <strong>Sunano</strong>
            <br />
            Razão social: <em>[PLACEHOLDER: razão social do MEI]</em>
            <br />
            CNPJ: <em>[PLACEHOLDER: número do CNPJ]</em>
            <br />
            Endereço: <em>[PLACEHOLDER: endereço físico/postal para correspondência]</em>
          </p>
        </section>

        <section>
          <h2>Canais de atendimento (SAC)</h2>
          <p>
            E-mail:{" "}
            <a href="mailto:contato@sunano.gg" className="text-primary hover:underline">
              contato@sunano.gg
            </a>
            <br />
            Outro canal: <em>[PLACEHOLDER: telefone/WhatsApp de suporte, se houver]</em>
          </p>
          <p>
            Dúvidas sobre pedidos, trocas e devoluções devem ser encaminhadas por esses canais,
            informando o número do pedido.
          </p>
        </section>

        <section>
          <h2>Documentos relacionados</h2>
          <ul>
            <li>
              <Link href="/trocas-e-devolucoes" className="text-primary hover:underline">
                Política de Trocas e Devoluções
              </Link>
            </li>
            <li>
              <Link href="/termos" className="text-primary hover:underline">
                Termos de Uso
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className="text-primary hover:underline">
                Política de Privacidade
              </Link>
            </li>
          </ul>
        </section>

      </div>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Esta página contém marcações [PLACEHOLDER] que precisam ser preenchidas com os dados
          reais do MEI e revisadas antes da publicação definitiva.
        </p>
      </footer>
    </article>
  )
}
