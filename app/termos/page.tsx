import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Termos de Uso | Sunano",
  description: "Termos e condições de uso da plataforma Sunano.",
}

export default function TermosPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Termos de Uso
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Condições de uso da plataforma
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Versão <strong>2026-06</strong> · Em vigor a partir de 13 de junho de 2026.
        </p>
      </header>

      <div className="prose prose-sm prose-invert max-w-none space-y-8 text-foreground/90 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:space-y-1 [&_li]:text-sm">

        <section>
          <h2>1. Aceitação dos Termos</h2>
          <p>
            Ao criar uma conta ou utilizar qualquer funcionalidade do <strong>Sunano</strong>,
            você declara ter lido, compreendido e concordado com estes Termos de Uso e com a{" "}
            <Link href="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </Link>
            . Caso não concorde, não utilize a plataforma.
          </p>
        </section>

        <section>
          <h2>2. Descrição do Serviço</h2>
          <p>
            O Sunano é uma plataforma de tierlist e reviews de periféricos para gamers que oferece:
          </p>
          <ul>
            <li>Tierlist e comparações de periféricos (mouses, teclados, headsets e outros).</li>
            <li>Reviews, blog e vídeos sobre periféricos.</li>
            <li>Fórum de discussão para a comunidade.</li>
            <li>Loja e bazar de periféricos novos e usados.</li>
            <li>Seção de ofertas e notícias.</li>
          </ul>
        </section>

        <section>
          <h2>3. Cadastro e Conta</h2>
          <ul>
            <li>Você deve fornecer informações verdadeiras e atualizadas no cadastro.</li>
            <li>É responsável pela confidencialidade de sua senha e pelo acesso à sua conta.</li>
            <li>Não é permitido compartilhar, vender ou transferir sua conta a terceiros.</li>
            <li>Menores de 13 anos não podem criar conta. Entre 13 e 18 anos, é necessário consentimento dos responsáveis.</li>
            <li>
              O Sunano pode suspender ou encerrar contas que violem estes Termos, sem aviso prévio
              em casos de violação grave.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Regras de Conduta</h2>
          <p>Ao usar o fórum e outras funcionalidades interativas, você concorda em:</p>
          <ul>
            <li>Não publicar conteúdo ilegal, difamatório, obsceno, ameaçador ou discriminatório.</li>
            <li>Não fazer spam, flood ou publicidade não autorizada.</li>
            <li>Não fazer impersonação de outros usuários ou do Sunano.</li>
            <li>Não tentar acessar áreas restritas ou sistemas do Sunano sem autorização.</li>
            <li>Não distribuir malware, vírus ou código malicioso.</li>
            <li>Respeitar direitos autorais e propriedade intelectual de terceiros.</li>
          </ul>
          <p>
            Conteúdos que violem estas regras podem ser removidos a qualquer momento pelos
            moderadores, e as contas responsáveis poderão ser suspensas.
          </p>
        </section>

        <section>
          <h2>5. Conteúdo do Usuário</h2>
          <p>
            Ao publicar conteúdo no fórum ou em comentários, você concede ao Sunano uma licença
            não exclusiva, gratuita e mundial para exibir, distribuir e reproduzir esse conteúdo
            na plataforma.
          </p>
          <p>
            Você é o único responsável pelo conteúdo que publica e garante que possui os direitos
            necessários para compartilhá-lo.
          </p>
        </section>

        <section>
          <h2>6. Compras na Loja</h2>
          <ul>
            <li>Os preços são exibidos em Reais (BRL) e incluem impostos quando aplicável.</li>
            <li>Pagamentos são processados com segurança pelo Stripe.</li>
            <li>
              Pedidos confirmados geram obrigação de pagamento. Cancelamentos e reembolsos seguem
              a política de cancelamento disponível na página do produto.
            </li>
            <li>
              O Sunano se reserva o direito de cancelar pedidos em caso de erro de preço, fraude
              suspeita ou indisponibilidade de estoque.
            </li>
            <li>
              Compras estão sujeitas ao{" "}
              <strong>Código de Defesa do Consumidor (Lei 8.078/1990)</strong>, incluindo o direito
              de arrependimento em até 7 dias para compras online.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Propriedade Intelectual</h2>
          <p>
            Todo o conteúdo do Sunano — incluindo design, textos, imagens, código-fonte e tierlist
            — é de propriedade do Sunano ou licenciado a ele. É proibida a reprodução, distribuição
            ou modificação sem autorização expressa.
          </p>
        </section>

        <section>
          <h2>8. Isenção de Garantias</h2>
          <p>
            O Sunano é fornecido <em>&ldquo;no estado em que se encontra&rdquo;</em>. Não garantimos
            disponibilidade ininterrupta, precisão das informações de periféricos ou adequação a
            uma finalidade específica. As tierlists e reviews refletem opiniões editoriais e não
            constituem aconselhamento de compra obrigatório.
          </p>
        </section>

        <section>
          <h2>9. Limitação de Responsabilidade</h2>
          <p>
            Na máxima extensão permitida pela lei brasileira, o Sunano não é responsável por danos
            indiretos, incidentais ou consequenciais decorrentes do uso da plataforma.
          </p>
        </section>

        <section>
          <h2>10. Privacidade e LGPD</h2>
          <p>
            O tratamento de dados pessoais é regido pela nossa{" "}
            <Link href="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </Link>
            , em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).
          </p>
        </section>

        <section>
          <h2>11. Alterações nos Termos</h2>
          <p>
            Podemos atualizar estes Termos a qualquer momento. Alterações materiais serão
            comunicadas por e-mail ou aviso no site com antecedência mínima de 10 dias. O uso
            continuado após a vigência das alterações implica aceite.
          </p>
        </section>

        <section>
          <h2>12. Lei Aplicável e Foro</h2>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Para dirimir
            conflitos, fica eleito o foro da comarca de domicílio do usuário, conforme o Art. 101
            do Código de Defesa do Consumidor.
          </p>
        </section>

        <section>
          <h2>13. Contato</h2>
          <p>
            Para dúvidas sobre estes Termos:{" "}
            <a href="mailto:contato@sunano.gg" className="text-primary hover:underline">
              contato@sunano.gg
            </a>
          </p>
        </section>

      </div>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Versão 2026-06 · Última atualização: 13 de junho de 2026.{" "}
          <Link href="/privacidade" className="text-primary hover:underline">
            Política de Privacidade
          </Link>
        </p>
      </footer>
    </article>
  )
}
