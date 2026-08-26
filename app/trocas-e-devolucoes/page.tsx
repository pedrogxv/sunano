import Link from "next/link"
import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Trocas e Devoluções",
  description: "Política de trocas, devoluções e direito de arrependimento das compras na Loja Sunano, com prazos e como solicitar.",
  path: "/trocas-e-devolucoes",
  eyebrow: "Legal",
  subtitle: "Prazos e como solicitar",
})

export default function TrocasEDevolucoesPage() {
  return (
    <article className="mx-auto max-w-3xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Trocas e Devoluções
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Política de trocas, devoluções e arrependimento
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Versão <strong>2026-09</strong> · Em vigor a partir de 1º de setembro de 2026.
        </p>
      </header>

      <div className="prose prose-sm prose-invert max-w-none space-y-8 text-foreground/90 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:space-y-1 [&_li]:text-sm">

        <section>
          <p>
            Esta política se aplica a todas as compras feitas na Loja do Sunano e segue
            o <strong>Código de Defesa do Consumidor (Lei 8.078/1990)</strong> e o{" "}
            <strong>Decreto 7.962/2013</strong>, que regula as contratações no comércio eletrônico.
          </p>
        </section>

        <section id="arrependimento">
          <h2>1. Direito de arrependimento (compra online)</h2>
          <p>
            Como toda compra feita fora de um estabelecimento físico, você tem até{" "}
            <strong>7 (sete) dias corridos</strong>, contados a partir do recebimento do produto,
            para desistir da compra — <strong>sem precisar justificar o motivo</strong> (Art. 49 do
            CDC).
          </p>
          <ul>
            <li>O reembolso é <strong>integral</strong>, incluindo o valor do frete pago.</li>
            <li>
              O produto deve ser devolvido em condições de uso normal: preferencialmente na
              embalagem original, com todos os acessórios e sem sinais de mau uso.
            </li>
            <li>
              O prazo de 7 dias vale mesmo que você já tenha aberto a embalagem ou testado o
              produto — arrependimento não exige que o produto esteja lacrado.
            </li>
          </ul>
        </section>

        <section id="trocas-por-defeito">
          <h2>2. Trocas por defeito ou vício do produto</h2>
          <p>
            Se o produto apresentar defeito de fabricação ou não corresponder ao anunciado, você
            tem um prazo diferente do arrependimento — regido pelo Art. 18 do CDC:
          </p>
          <ul>
            <li>
              <strong>30 dias corridos</strong> a partir da entrega para produtos não duráveis, e{" "}
              <strong>90 dias corridos</strong> para produtos duráveis (a maioria dos periféricos se
              enquadra aqui), para reclamar de vícios aparentes ou de fácil constatação.
            </li>
            <li>
              Nesse caso você pode escolher entre: substituição do produto, restituição do valor
              pago, ou abatimento proporcional do preço.
            </li>
          </ul>
        </section>

        <section id="como-solicitar">
          <h2>3. Como solicitar troca, devolução ou reembolso</h2>
          <ol>
            <li>Entre em contato pelo canal de atendimento indicado na página{" "}
              <Link href="/quem-somos" className="text-primary hover:underline">Quem Somos</Link>
              , informando o número do pedido.
            </li>
            <li>Informe se é um caso de arrependimento (item 1) ou defeito/vício (item 2).</li>
            <li>Combinaremos a forma de devolução do produto (o frete de devolução por arrependimento é por nossa conta).</li>
            <li>
              Após recebermos e conferirmos o produto devolvido, o reembolso é processado no mesmo
              meio de pagamento utilizado na compra, em até 10 dias úteis. Reembolsos via Pix
              passam por uma validação manual adicional no gateway de pagamento antes de serem
              efetivados, o que pode estender esse prazo.
            </li>
          </ol>
        </section>

        <section id="identificacao-do-vendedor">
          <h2>4. Identificação do vendedor</h2>
          <p>
            Nome fantasia: <strong>Sunano</strong>
            <br />
            Razão social / CNPJ: <em>[PLACEHOLDER: preencher com os dados do MEI antes de publicar]</em>
            <br />
            Endereço: <em>[PLACEHOLDER: endereço para fins de cadastro/correspondência]</em>
            <br />
            Canal de atendimento (SAC): <em>[PLACEHOLDER: e-mail e/ou telefone/WhatsApp de suporte]</em>
          </p>
        </section>

        <section id="procon">
          <h2>5. Se não conseguirmos resolver</h2>
          <p>
            Caso não cheguemos a um acordo pelo nosso canal de atendimento, você também pode
            recorrer ao PROCON da sua região ou à plataforma{" "}
            <em>[PLACEHOLDER: link para consumidor.gov.br, se aderirmos à plataforma]</em>.
          </p>
        </section>

      </div>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Versão 2026-09 · Este texto contém marcações [PLACEHOLDER] que precisam ser preenchidas
          com os dados reais do MEI e revisadas por um contador/advogado antes da publicação
          definitiva.{" "}
          <Link href="/termos" className="text-primary hover:underline">
            Termos de Uso
          </Link>
          {" · "}
          <Link href="/privacidade" className="text-primary hover:underline">
            Política de Privacidade
          </Link>
        </p>
      </footer>
    </article>
  )
}
