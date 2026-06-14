import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de Privacidade | Sunano",
  description: "Saiba como o Sunano coleta, usa e protege seus dados pessoais em conformidade com a LGPD.",
}

const CURRENT_VERSION = "2026-06"

export default function PrivacidadePage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Política de Privacidade
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Como tratamos seus dados pessoais
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Versão <strong>{CURRENT_VERSION}</strong> · Em vigor a partir de 13 de junho de 2026.
          Em conformidade com a <strong>Lei Geral de Proteção de Dados — LGPD (Lei 13.709/2018)</strong>.
        </p>
      </header>

      <div className="prose prose-sm prose-invert max-w-none space-y-8 text-foreground/90 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:space-y-1 [&_li]:text-sm">

        <section>
          <h2>1. Identificação do Controlador</h2>
          <p>
            O <strong>Sunano</strong> é o controlador dos dados pessoais tratados neste site, nos
            termos do Art. 5º, VI da LGPD. Para exercer seus direitos ou tirar dúvidas sobre
            privacidade, entre em contato pelo e-mail{" "}
            <a href="mailto:privacidade@sunano.gg" className="text-primary hover:underline">
              privacidade@sunano.gg
            </a>
            .
          </p>
        </section>

        <section>
          <h2>2. Dados que Coletamos</h2>

          <h3>2.1 Dados de conta e autenticação</h3>
          <ul>
            <li><strong>E-mail</strong> — obrigatório para criar conta e fazer login.</li>
            <li><strong>Senha</strong> — armazenada exclusivamente como hash seguro pelo Supabase Auth.</li>
            <li><strong>Nome de exibição</strong> — como você aparece no fórum e na loja.</li>
            <li>
              <strong>Foto de perfil (avatar)</strong> — opcional; pode ser enviada por você ou
              obtida automaticamente via OAuth (Google / Discord).
            </li>
            <li>
              <strong>Fatores de autenticação em dois fatores (2FA/TOTP)</strong> — gerenciados
              pelo Supabase Auth, não armazenados diretamente pelo Sunano.
            </li>
          </ul>

          <h3>2.2 Dados de compra (opcionais)</h3>
          <ul>
            <li>Nome completo, CPF, telefone.</li>
            <li>Endereço completo (CEP, logradouro, número, complemento, bairro, cidade, estado).</li>
          </ul>
          <p>
            Esses dados são coletados apenas quando você opta pelo <em>cadastro completo</em> para
            compras na loja. Sem eles, você pode usar o fórum e outras áreas normalmente.
          </p>

          <h3>2.3 Conteúdo gerado pelo usuário</h3>
          <ul>
            <li>Posts e comentários no fórum.</li>
            <li>Comentários em reviews do blog.</li>
          </ul>

          <h3>2.4 Dados de pedidos</h3>
          <ul>
            <li>Histórico de compras: produtos, valores, status do pagamento.</li>
            <li>
              Identificadores do Stripe (<code>session_id</code>, <code>payment_intent_id</code>).
            </li>
            <li>E-mail e nome associados ao pagamento.</li>
          </ul>

          <h3>2.5 Dados técnicos e de acesso</h3>
          <ul>
            <li>Endereço IP coletado em ações de segurança (criação de conta, 2FA, exclusão de conta).</li>
            <li>Preferências de interface: tema visual e idioma.</li>
            <li>Cookies de sessão HTTPOnly (ver Seção 6).</li>
          </ul>
        </section>

        <section>
          <h2>3. Finalidade e Base Legal</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Dado</th>
                  <th className="px-4 py-3 text-left font-semibold">Finalidade</th>
                  <th className="px-4 py-3 text-left font-semibold">Base Legal (LGPD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3">E-mail e senha</td>
                  <td className="px-4 py-3">Autenticação e comunicação transacional</td>
                  <td className="px-4 py-3">Execução de contrato (Art. 7, V)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Nome, avatar</td>
                  <td className="px-4 py-3">Identificação no fórum e na loja</td>
                  <td className="px-4 py-3">Execução de contrato (Art. 7, V)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">CPF, endereço</td>
                  <td className="px-4 py-3">Processamento de pedidos e entrega</td>
                  <td className="px-4 py-3">Consentimento (Art. 7, I) e execução de contrato (Art. 7, V)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Pedidos e pagamentos</td>
                  <td className="px-4 py-3">Cumprimento de obrigação legal e fiscal</td>
                  <td className="px-4 py-3">Obrigação legal (Art. 7, II)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">IP em ações de segurança</td>
                  <td className="px-4 py-3">Prevenção de fraudes e proteção da conta</td>
                  <td className="px-4 py-3">Legítimo interesse (Art. 7, IX)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">Conteúdo do fórum</td>
                  <td className="px-4 py-3">Funcionamento da comunidade</td>
                  <td className="px-4 py-3">Consentimento (Art. 7, I)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>4. Compartilhamento com Terceiros</h2>
          <p>
            Seus dados são compartilhados <strong>apenas</strong> com os seguintes operadores, na
            estrita medida necessária para a prestação de cada serviço:
          </p>

          <h3>Supabase (banco de dados e autenticação)</h3>
          <p>
            Armazena perfis, sessões, dados do fórum e do blog. Servidor: União Europeia / EUA
            (conforme configuração do projeto). Política:{" "}
            <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              supabase.com/privacy
            </a>
            .
          </p>

          <h3>Stripe (pagamentos)</h3>
          <p>
            Processa pagamentos com cartão e Pix. Recebe seu e-mail e nome para emissão de recibo.
            O Sunano nunca armazena dados de cartão de crédito — eles são processados exclusivamente
            pelo Stripe. Política:{" "}
            <a href="https://stripe.com/br/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              stripe.com/br/privacy
            </a>
            .
          </p>

          <h3>Telegram (ofertas)</h3>
          <p>
            O Sunano lê mensagens públicas de um grupo de ofertas via bot do Telegram. Nenhum dado
            seu é enviado ao Telegram.
          </p>

          <h3>YouTube (vídeos)</h3>
          <p>
            Consultamos a API pública do YouTube para exibir vídeos do canal. Nenhum dado pessoal
            é transmitido.
          </p>

          <p className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
            Não vendemos, alugamos nem cedemos seus dados a terceiros para fins de marketing.
          </p>
        </section>

        <section>
          <h2>5. Retenção de Dados</h2>
          <ul>
            <li>
              <strong>Perfil e dados de conta:</strong> mantidos enquanto a conta existir. Excluídos
              imediatamente quando você solicita a exclusão.
            </li>
            <li>
              <strong>Posts e comentários do fórum:</strong> o conteúdo permanece (para integridade
              da comunidade), mas seu nome e e-mail são substituídos por &ldquo;[usuário removido]&rdquo;
              na exclusão da conta.
            </li>
            <li>
              <strong>Pedidos e pagamentos:</strong> retidos por até <strong>5 anos</strong> para
              cumprimento de obrigações fiscais e legais (Art. 16, II da LGPD). Nome e e-mail do
              cliente são anonimizados na exclusão; os dados financeiros permanecem para fins de
              auditoria.
            </li>
            <li>
              <strong>Log de auditoria:</strong> retido por até <strong>2 anos</strong> para
              rastreabilidade de operações sobre dados pessoais (Art. 37 da LGPD).
            </li>
            <li>
              <strong>Eventos de limitação de taxa (rate limit):</strong> excluídos automaticamente
              após 5 minutos.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Cookies e Rastreamento</h2>
          <p>O Sunano utiliza apenas cookies estritamente necessários:</p>
          <ul>
            <li>
              <strong>Cookie de sessão (HTTPOnly, Secure):</strong> mantém você autenticado entre
              páginas. Não pode ser lido por scripts e é removido ao fazer logout.
            </li>
            <li>
              <strong>Cookie de preferências (localStorage):</strong> tema visual e idioma,
              armazenados localmente no seu navegador.
            </li>
          </ul>
          <p>
            <strong>Não utilizamos</strong> cookies de rastreamento, publicidade ou análise de
            comportamento (sem Google Analytics, Meta Pixel ou similares).
          </p>
        </section>

        <section>
          <h2>7. Seus Direitos (LGPD Art. 18)</h2>
          <p>Como titular de dados, você tem os seguintes direitos, exercíveis a qualquer momento:</p>
          <ul>
            <li><strong>Confirmação e acesso</strong> — saber se tratamos seus dados e consultá-los.</li>
            <li><strong>Correção</strong> — atualizar dados incompletos, inexatos ou desatualizados em <Link href="/perfil" className="text-primary hover:underline">/perfil</Link>.</li>
            <li>
              <strong>Anonimização, bloqueio ou eliminação</strong> — remover dados desnecessários ou
              excessivos. Use a opção de exclusão de conta em{" "}
              <Link href="/perfil" className="text-primary hover:underline">/perfil → Privacidade</Link>.
            </li>
            <li>
              <strong>Portabilidade</strong> — exportar seus dados em formato estruturado (JSON) em{" "}
              <Link href="/perfil" className="text-primary hover:underline">/perfil → Privacidade → Exportar meus dados</Link>.
            </li>
            <li>
              <strong>Informação sobre compartilhamento</strong> — saber com quais entidades seus dados
              são compartilhados (ver Seção 4).
            </li>
            <li>
              <strong>Revogação de consentimento</strong> — retirar seu consentimento a qualquer momento,
              sem prejudicar tratamentos realizados anteriormente com base nele.
            </li>
            <li>
              <strong>Oposição</strong> — opor-se a tratamentos baseados em legítimo interesse.
            </li>
            <li>
              <strong>Petição à ANPD</strong> — apresentar reclamação à Autoridade Nacional de Proteção
              de Dados (<a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">gov.br/anpd</a>).
            </li>
          </ul>
          <p>
            Para exercer qualquer direito, envie um e-mail para{" "}
            <a href="mailto:privacidade@sunano.gg" className="text-primary hover:underline">
              privacidade@sunano.gg
            </a>{" "}
            com o assunto <em>&ldquo;Direito LGPD — [seu direito]&rdquo;</em>. Responderemos em até
            15 dias úteis.
          </p>
        </section>

        <section>
          <h2>8. Segurança</h2>
          <p>Adotamos as seguintes medidas técnicas e organizacionais (LGPD Art. 46):</p>
          <ul>
            <li>Comunicação criptografada via TLS/HTTPS em todas as requisições.</li>
            <li>Senhas armazenadas exclusivamente como hash (bcrypt/Argon2) pelo Supabase Auth.</li>
            <li>Row-Level Security (RLS) no banco de dados PostgreSQL.</li>
            <li>Autenticação em dois fatores (TOTP) disponível para todos os usuários.</li>
            <li>Política de senha forte (mínimo 8 caracteres com letras, números e símbolos).</li>
            <li>Limitação de taxa (rate limiting) para proteger contra ataques de força bruta.</li>
            <li>Log de auditoria de operações sensíveis sobre dados pessoais.</li>
            <li>Tokens de sessão HTTPOnly para prevenir roubo via XSS.</li>
          </ul>
        </section>

        <section>
          <h2>9. Incidentes de Segurança</h2>
          <p>
            Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos
            titulares, comunicaremos à ANPD e aos usuários afetados no prazo de até{" "}
            <strong>72 horas</strong> após a ciência do ocorrido, conforme Art. 48 da LGPD.
          </p>
        </section>

        <section>
          <h2>10. Menores de Idade</h2>
          <p>
            O Sunano não é direcionado a menores de 13 anos. Não coletamos intencionalmente dados de
            crianças. Se você tiver conhecimento de que uma criança nos forneceu dados pessoais, entre
            em contato para que possamos excluí-los.
          </p>
        </section>

        <section>
          <h2>11. Alterações nesta Política</h2>
          <p>
            Podemos atualizar esta Política periodicamente. Quando houver mudanças materiais,
            notificaremos por e-mail e/ou por aviso em destaque no site. A versão atual é sempre
            identificada pela data no topo desta página. O uso continuado do site após a notificação
            implica aceite das alterações.
          </p>
        </section>

        <section>
          <h2>12. Contato e Encarregado (DPO)</h2>
          <p>
            Para dúvidas, solicitações ou reclamações relacionadas à privacidade e proteção de dados:
          </p>
          <ul>
            <li>
              <strong>E-mail:</strong>{" "}
              <a href="mailto:privacidade@sunano.gg" className="text-primary hover:underline">
                privacidade@sunano.gg
              </a>
            </li>
          </ul>
        </section>

      </div>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Versão {CURRENT_VERSION} · Última atualização: 13 de junho de 2026.{" "}
          <Link href="/termos" className="text-primary hover:underline">
            Termos de Uso
          </Link>
        </p>
      </footer>
    </article>
  )
}
