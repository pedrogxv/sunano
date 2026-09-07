import Link from "next/link"
import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Termos de Uso",
  description: "Termos e condições de uso da plataforma Sunano: regras da comunidade, da Loja, da conta e responsabilidades de cada parte.",
  path: "/termos",
  eyebrow: "Legal",
  subtitle: "Regras de uso da plataforma",
})

const CURRENT_VERSION = "2026-08.3"

export default function TermosPage() {
  return (
    <article className="mx-auto max-w-3xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Termos de Uso
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Condições de uso da plataforma
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Versão <strong>{CURRENT_VERSION}</strong> · Em vigor a partir de 31 de agosto de 2026.
        </p>
      </header>

      <div className="prose prose-sm prose-invert max-w-none space-y-8 text-foreground/90 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:space-y-1 [&_li]:text-sm">

        <section>
          <p>
            Estes Termos de Uso estabelecem as regras para utilização do <strong>Sunano</strong>,
            incluindo suas áreas de conteúdo, tierlists, reviews, comunidade, sistema de Aura,
            ofertas e demais funcionalidades disponibilizadas pela plataforma.
          </p>
          <p>
            Ao utilizar o Sunano, você concorda em respeitar estes Termos e as regras específicas
            aplicáveis às funcionalidades que escolher utilizar.
          </p>
        </section>

        <section>
          <h2>1. Aceitação dos Termos</h2>
          <p>
            Ao criar uma conta ou utilizar funcionalidades do <strong>Sunano</strong>, você declara
            ter lido e compreendido estes Termos de Uso e concorda em respeitá-los.
          </p>
          <p>
            Determinadas áreas ou serviços poderão possuir regras próprias, incluindo a{" "}
            <Link href="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </Link>
            , políticas da loja, regras de campanhas, programas, benefícios ou funcionalidades
            específicas. Essas regras complementam estes Termos exclusivamente em relação às
            respectivas funcionalidades.
          </p>
          <p>
            Nenhuma disposição destes Termos tem como objetivo excluir, limitar ou substituir
            direitos assegurados obrigatoriamente pela legislação brasileira.
          </p>
          <p>
            Caso você não concorde com estes Termos, deverá interromper a utilização das
            funcionalidades que dependam de sua aceitação.
          </p>
        </section>

        <section>
          <h2>2. Descrição do Serviço</h2>
          <p>
            O Sunano é uma plataforma voltada principalmente a{" "}
            <strong>periféricos, hardware, tecnologia e comunidade</strong>, podendo oferecer:
          </p>
          <ul>
            <li>tierlists e rankings;</li>
            <li>banco de dados de periféricos;</li>
            <li>comparações de produtos;</li>
            <li>reviews e análises;</li>
            <li>artigos e notícias;</li>
            <li>vídeos e outros conteúdos;</li>
            <li>fórum e áreas de discussão;</li>
            <li>perfis de usuários;</li>
            <li>comentários e avaliações;</li>
            <li>sistema de Aura;</li>
            <li>missões, conquistas, medalhas e ofensivas (<em>streaks</em>);</li>
            <li>ofertas;</li>
            <li>loja;</li>
            <li>programas, eventos e funcionalidades destinadas à comunidade.</li>
          </ul>
          <p>
            As funcionalidades poderão ser adicionadas, modificadas, aprimoradas, substituídas ou
            descontinuadas ao longo do desenvolvimento do Sunano.
          </p>
          <p>
            Algumas funcionalidades poderão ser disponibilizadas em versão experimental, beta ou em
            desenvolvimento e, por isso, poderão sofrer alterações com maior frequência.
          </p>
          <p>
            A existência de uma funcionalidade gratuita em determinado momento não gera obrigação de
            sua manutenção permanente, respeitados direitos já constituídos e obrigações legais
            aplicáveis.
          </p>
        </section>

        <section>
          <h2>3. Cadastro, Conta e Idade do Usuário</h2>
          <p>Determinadas funcionalidades exigem a criação de uma conta.</p>
          <p>
            O usuário deverá fornecer informações verdadeiras e atualizadas quando essas informações
            forem necessárias para utilização da plataforma.
          </p>
          <p>É responsabilidade do usuário:</p>
          <ul>
            <li>proteger sua senha;</li>
            <li>proteger seus códigos de autenticação;</li>
            <li>não compartilhar suas credenciais;</li>
            <li>manter controle sobre os dispositivos utilizados para acessar sua conta;</li>
            <li>comunicar ao Sunano atividades suspeitas, quando identificadas;</li>
            <li>manter seus dados atualizados quando necessário para determinada funcionalidade.</li>
          </ul>
          <p>
            Não é permitido vender, alugar, ceder, negociar ou transferir permanentemente uma conta
            do Sunano para terceiros sem autorização.
          </p>
          <p>
            O usuário poderá ser responsabilizado pelas atividades realizadas por meio de sua conta
            quando decorrentes de sua própria ação, autorização, compartilhamento voluntário de
            acesso ou negligência relevante na proteção das credenciais, sem prejuízo da análise de
            situações envolvendo invasão, fraude ou acesso não autorizado.
          </p>

          <h3>Idade mínima</h3>
          <p>
            O Sunano não é destinado a crianças menores de <strong>13 anos</strong>.
          </p>
          <p>
            Usuários menores de 18 anos deverão utilizar a plataforma com ciência e supervisão de
            seus pais ou responsáveis, observadas as exigências da legislação aplicável.
          </p>
          <p>
            Determinadas funcionalidades poderão possuir restrições adicionais de idade ou exigir
            participação do responsável legal.
          </p>
          <p>
            O Sunano poderá adotar mecanismos proporcionais de segurança, proteção, restrição de
            funcionalidades ou verificação de faixa etária quando necessário para cumprimento da
            legislação ou proteção de crianças e adolescentes.
          </p>
        </section>

        <section id="regras-de-conduta">
          <h2>4. Regras de Conduta e Moderação</h2>
          <p>
            Ao utilizar fórum, comentários, perfis ou outras áreas interativas, o usuário deverá
            respeitar a legislação, estes Termos e as regras da comunidade.
          </p>
          <p>É proibido:</p>
          <ul>
            <li>publicar conteúdo ilegal;</li>
            <li>ameaçar, perseguir, assediar ou intimidar terceiros;</li>
            <li>publicar conteúdo destinado a promover discriminação ou ódio contra pessoas ou grupos;</li>
            <li>incentivar crimes ou práticas ilícitas;</li>
            <li>publicar material envolvendo exploração ou abuso sexual de crianças ou adolescentes;</li>
            <li>divulgar dados pessoais ou informações privadas de terceiros de forma indevida;</li>
            <li>praticar <em>doxxing</em>;</li>
            <li>realizar spam ou flood;</li>
            <li>divulgar publicidade não autorizada;</li>
            <li>utilizar a plataforma para fraude, golpes ou práticas enganosas;</li>
            <li>se passar por outro usuário, empresa ou membro da equipe do Sunano;</li>
            <li>
              utilizar nome de exibição, biografia ou outros campos principalmente para ofender,
              ameaçar ou discriminar terceiros;
            </li>
            <li>distribuir malware, vírus ou código malicioso;</li>
            <li>tentar obter acesso não autorizado a contas, sistemas ou áreas restritas;</li>
            <li>explorar vulnerabilidades deliberadamente;</li>
            <li>prejudicar intencionalmente o funcionamento ou a segurança da plataforma;</li>
            <li>utilizar bots, scripts ou automações não autorizadas para manipular funcionalidades;</li>
            <li>violar direitos autorais, marcas, direitos de imagem ou outros direitos de terceiros.</li>
          </ul>

          <h3>Moderação</h3>
          <p>
            O Sunano poderá utilizar moderação humana, ferramentas automatizadas e mecanismos de
            prevenção e detecção de abuso.
          </p>
          <p>A equipe poderá:</p>
          <ul>
            <li>remover ou ocultar conteúdo;</li>
            <li>limitar sua visibilidade;</li>
            <li>aplicar advertências;</li>
            <li>restringir funcionalidades;</li>
            <li>suspender contas;</li>
            <li>encerrar contas;</li>
            <li>corrigir benefícios obtidos irregularmente;</li>
            <li>
              preservar informações quando necessário para segurança ou cumprimento de obrigações
              legais.
            </li>
          </ul>
          <p>
            As medidas poderão variar conforme a gravidade, recorrência, histórico da conta e
            circunstâncias do caso.
          </p>
          <p>
            Em situações graves envolvendo fraude, risco à segurança, exploração da plataforma,
            conteúdo manifestamente ilícito ou risco relevante a terceiros, medidas poderão ser
            adotadas imediatamente.
          </p>
          <p>
            Quando aplicável, o usuário poderá solicitar revisão da medida pelos canais de
            atendimento do Sunano.
          </p>
          <p>O Sunano não é obrigado a divulgar informações que possam comprometer:</p>
          <ul>
            <li>mecanismos antifraude;</li>
            <li>métodos de detecção de abuso;</li>
            <li>sistemas de segurança;</li>
            <li>dados pessoais de terceiros;</li>
            <li>investigações em andamento;</li>
            <li>informações protegidas legalmente.</li>
          </ul>
          <p>
            A ausência de remoção imediata de determinado conteúdo não significa aprovação,
            concordância ou endosso por parte do Sunano.
          </p>

          <h3>Filtros automáticos</h3>
          <p>
            Algumas áreas poderão utilizar filtros destinados a identificar palavras, padrões ou
            conteúdos incompatíveis com as regras da plataforma.
          </p>
          <p>
            Esses sistemas podem apresentar falsos positivos ou deixar de identificar determinado
            conteúdo, podendo haver revisão posterior pela equipe.
          </p>
        </section>

        <section>
          <h2>5. Aura, Recompensas e Gamificação</h2>
          <p>
            A <strong>Aura</strong> é uma recompensa interna do Sunano criada como forma de
            reconhecer, incentivar e gratificar a participação legítima dos usuários na plataforma.
          </p>
          <p>A Aura poderá ser concedida por atividades como:</p>
          <ul>
            <li>participação na comunidade;</li>
            <li>comentários;</li>
            <li>posts;</li>
            <li>missões;</li>
            <li>conquistas;</li>
            <li>ofensivas (<em>streaks</em>);</li>
            <li>eventos;</li>
            <li>campanhas;</li>
            <li>avaliações;</li>
            <li>outras atividades disponibilizadas pelo Sunano.</li>
          </ul>
          <p>
            As formas de obtenção e as quantidades concedidas poderão variar ao longo do tempo.
          </p>

          <h3>Utilização da Aura</h3>
          <p>
            A Aura poderá ser utilizada para acessar, obter ou resgatar{" "}
            <strong>benefícios e recompensas disponibilizados pelo Sunano</strong>, conforme as
            regras apresentadas para cada funcionalidade.
          </p>
          <p>Esses benefícios poderão incluir:</p>
          <ul>
            <li>personalizações;</li>
            <li>vantagens relacionadas à conta;</li>
            <li>benefícios promocionais;</li>
            <li>acesso a funcionalidades;</li>
            <li>participação em programas;</li>
            <li>acesso ou candidatura a determinadas oportunidades;</li>
            <li>recompensas disponibilizadas dentro da plataforma;</li>
            <li>outras utilizações futuramente implementadas.</li>
          </ul>
          <p>
            Cada benefício poderá possuir regras próprias, incluindo quantidade necessária de Aura,
            requisitos, elegibilidade, disponibilidade, limites e período de utilização.
          </p>
          <p>
            A disponibilização de determinado benefício em um momento não obriga o Sunano a mantê-lo
            indefinidamente.
          </p>

          <h3>Natureza da Aura</h3>
          <p>
            A Aura é um <strong>sistema interno de recompensas do Sunano</strong>.
          </p>
          <p>
            Salvo quando expressamente estabelecido de maneira diferente por uma funcionalidade
            específica e dentro da legislação aplicável:
          </p>
          <ul>
            <li>Aura não representa dinheiro;</li>
            <li>não constitui moeda de curso legal;</li>
            <li>não constitui depósito;</li>
            <li>não constitui investimento;</li>
            <li>não constitui criptoativo;</li>
            <li>não gera juros ou rendimento;</li>
            <li>não possui direito de saque;</li>
            <li>não pode ser convertida diretamente em dinheiro;</li>
            <li>não pode ser comercializada entre usuários;</li>
            <li>
              não pode ser transferida entre contas sem funcionalidade expressamente disponibilizada
              pelo Sunano.
            </li>
          </ul>

          <h3>Uso legítimo</h3>
          <p>É proibido gerar Aura, conquistas, benefícios ou progresso artificialmente.</p>
          <p>Isso inclui:</p>
          <ul>
            <li>utilização de múltiplas contas para benefício próprio ou de terceiros;</li>
            <li>criação coordenada de contas;</li>
            <li>bots;</li>
            <li>scripts;</li>
            <li>automações;</li>
            <li>curtidas artificiais;</li>
            <li>comentários ou posts criados principalmente para explorar o sistema de recompensas;</li>
            <li>manipulação de reviews ou avaliações;</li>
            <li>manipulação de missões;</li>
            <li>manipulação de ofensivas;</li>
            <li>combinações entre usuários destinadas a gerar Aura artificialmente;</li>
            <li>exploração deliberada de bugs ou falhas;</li>
            <li>qualquer forma de manipulação incompatível com o uso legítimo da plataforma.</li>
          </ul>
          <p>
            Quando houver indícios razoáveis de abuso, o Sunano poderá analisar as atividades
            relacionadas à conta.
          </p>
          <p>Confirmada a irregularidade, poderão ser aplicadas medidas como:</p>
          <ul>
            <li>correção do saldo;</li>
            <li>remoção da Aura obtida irregularmente;</li>
            <li>cancelamento de benefícios obtidos por fraude;</li>
            <li>remoção de conquistas ou medalhas;</li>
            <li>restrição de funcionalidades;</li>
            <li>suspensão;</li>
            <li>encerramento da conta em situações graves ou reincidentes.</li>
          </ul>

          <h3>Erros técnicos</h3>
          <p>
            Caso um bug, erro de configuração ou falha técnica conceda Aura, benefícios ou
            recompensas incorretamente, o Sunano poderá corrigir o erro e os registros afetados.
          </p>
          <p>A existência de uma falha não autoriza sua exploração deliberada.</p>

          <h3>Programas e recompensas futuras</h3>
          <p>
            A Aura poderá futuramente ser utilizada como requisito de acesso ou participação em
            programas específicos do Sunano.
          </p>
          <p>
            Esses programas poderão possuir regulamentos próprios e estarão sujeitos às regras e
            exigências legais aplicáveis à respectiva modalidade.
          </p>
        </section>

        <section>
          <h2>6. Conteúdo Publicado pelo Usuário</h2>
          <p>
            O usuário continua sendo titular dos direitos que possuir sobre textos, imagens,
            comentários, reviews e demais conteúdos que publicar no Sunano.
          </p>
          <p>
            Ao publicar conteúdo, o usuário concede ao Sunano licença{" "}
            <strong>não exclusiva e gratuita</strong>, limitada às finalidades necessárias para:
          </p>
          <ul>
            <li>armazenar o conteúdo;</li>
            <li>exibi-lo na plataforma;</li>
            <li>disponibilizá-lo aos demais usuários;</li>
            <li>reproduzi-lo tecnicamente;</li>
            <li>adaptar sua apresentação a diferentes dispositivos;</li>
            <li>realizar backups;</li>
            <li>moderá-lo;</li>
            <li>manter o funcionamento e a segurança da plataforma;</li>
            <li>divulgar trechos relacionados à própria comunidade ou ao Sunano, quando adequado.</li>
          </ul>
          <p>
            Essa licença não transfere ao Sunano a propriedade intelectual do conteúdo original do
            usuário.
          </p>
          <p>
            O usuário declara possuir os direitos ou autorizações necessários para publicar o
            material enviado.
          </p>

          <h3>Exclusão de conta</h3>
          <p>
            Conteúdos inseridos em discussões públicas, como posts e comentários, poderão permanecer
            após a exclusão da conta quando sua remoção comprometer o contexto ou a integridade da
            comunidade.
          </p>
          <p>
            Nessas situações, o Sunano poderá desvincular ou anonimizar o conteúdo, utilizando
            identificação como <strong>&ldquo;[usuário removido]&rdquo;</strong>, quando aplicável.
          </p>
          <p>Conteúdos também poderão ser preservados quando houver fundamento legal para isso.</p>
        </section>

        <section>
          <h2>7. Reviews, Tierlists, Ofertas e Conteúdo Editorial</h2>
          <p>
            Reviews, tierlists, rankings, comparações e demais conteúdos editoriais do Sunano
            possuem finalidade <strong>informativa e opinativa</strong>.
          </p>
          <p>As avaliações poderão considerar aspectos objetivos e subjetivos, como:</p>
          <ul>
            <li>desempenho;</li>
            <li>construção;</li>
            <li>características;</li>
            <li>experiência de uso;</li>
            <li>preço;</li>
            <li>posicionamento no mercado;</li>
            <li>comparação com concorrentes;</li>
            <li>preferências e metodologia editorial.</li>
          </ul>
          <p>
            Uma posição em tierlist, nota ou recomendação não significa que determinado produto será
            necessariamente a melhor escolha para todas as pessoas.
          </p>
          <p>Informações sobre produtos também podem mudar após a publicação em razão de:</p>
          <ul>
            <li>novas revisões de hardware;</li>
            <li>alterações de firmware;</li>
            <li>atualizações de software;</li>
            <li>mudanças realizadas pelo fabricante;</li>
            <li>versões regionais;</li>
            <li>novas informações disponíveis.</li>
          </ul>
          <p>
            O Sunano poderá corrigir, complementar ou atualizar seus conteúdos a qualquer momento.
          </p>

          <h3>Ofertas e links externos</h3>
          <p>
            O Sunano poderá apresentar ofertas, preços, cupons ou links para lojas e serviços
            externos.
          </p>
          <p>
            Quando a compra ocorrer diretamente em plataforma de terceiro, o usuário deverá
            verificar as condições finais no ambiente do respectivo vendedor.
          </p>
          <p>
            Preços, disponibilidade, estoque, cupons e condições externas poderão ser alterados por
            terceiros sem controle ou aviso prévio ao Sunano.
          </p>
          <p>Alguns links poderão gerar comissão de afiliado para o Sunano.</p>
          <p>
            A existência de comissão não significa, por si só, que o Sunano seja o vendedor do
            produto indicado.
          </p>
          <p>Conteúdo patrocinado ou relação comercial será identificado quando necessário.</p>
        </section>

        <section>
          <h2>8. Loja e Transações Comerciais</h2>
          <p>
            O Sunano poderá disponibilizar uma área destinada à comercialização ou intermediação de
            produtos.
          </p>
          <p>
            As compras realizadas nessa área estão sujeitas às condições específicas apresentadas na
            loja e às políticas correspondentes, incluindo regras sobre:
          </p>
          <ul>
            <li>pedidos;</li>
            <li>pagamentos;</li>
            <li>envio;</li>
            <li>entrega;</li>
            <li>cancelamentos;</li>
            <li>direito de arrependimento;</li>
            <li>trocas;</li>
            <li>devoluções;</li>
            <li>garantia;</li>
            <li>reembolsos.</li>
          </ul>
          <p>
            Essas regras estão detalhadas na{" "}
            <Link href="/trocas-e-devolucoes" className="text-primary hover:underline">
              Política de Trocas, Devoluções e Garantia
            </Link>
            .
          </p>
          <p>
            Quando houver relação de consumo, serão respeitados os direitos obrigatórios previstos na
            legislação brasileira.
          </p>
          <p>
            Nada nestes Termos substitui ou reduz direitos previstos na legislação aplicável ao
            consumidor.
          </p>
        </section>

        <section>
          <h2>9. Propriedade Intelectual</h2>
          <p>
            Os direitos sobre os elementos originais desenvolvidos pelo Sunano pertencem ao Sunano
            ou aos respectivos titulares que tenham autorizado sua utilização.
          </p>
          <p>Isso poderá incluir:</p>
          <ul>
            <li>marca;</li>
            <li>nome;</li>
            <li>logotipos;</li>
            <li>mascotes;</li>
            <li>identidade visual;</li>
            <li>design;</li>
            <li>interface;</li>
            <li>textos editoriais;</li>
            <li>reviews;</li>
            <li>vídeos;</li>
            <li>fotografias próprias;</li>
            <li>gráficos;</li>
            <li>organização e apresentação das tierlists;</li>
            <li>metodologia editorial;</li>
            <li>elementos originais de bancos de dados;</li>
            <li>código e componentes desenvolvidos para a plataforma.</li>
          </ul>
          <p>
            Informações factuais sobre produtos, como peso, dimensões, especificações ou
            características técnicas públicas, não se tornam propriedade exclusiva do Sunano
            simplesmente por serem apresentadas na plataforma.
          </p>
          <p>
            Marcas, imagens, softwares, APIs, bibliotecas e conteúdos de terceiros permanecem
            sujeitos aos direitos de seus respectivos titulares.
          </p>
          <p>
            É proibido reproduzir ou explorar comercialmente conteúdo protegido do Sunano sem
            autorização, ressalvadas as utilizações permitidas pela legislação.
          </p>
          <p>
            Compartilhamentos, citações, referências e usos legítimos previstos em lei permanecem
            permitidos.
          </p>
        </section>

        <section>
          <h2>10. Disponibilidade e Responsabilidade</h2>
          <p>
            O Sunano busca manter a plataforma disponível, segura e funcional, mas não garante
            funcionamento absolutamente ininterrupto ou livre de erros.
          </p>
          <p>Poderão ocorrer indisponibilidades relacionadas a:</p>
          <ul>
            <li>manutenção;</li>
            <li>atualizações;</li>
            <li>falhas técnicas;</li>
            <li>problemas de infraestrutura;</li>
            <li>serviços de terceiros;</li>
            <li>ataques;</li>
            <li>incidentes de segurança;</li>
            <li>eventos fora do controle razoável do Sunano.</li>
          </ul>
          <p>
            O Sunano poderá realizar manutenção, correções ou alterações técnicas sempre que
            necessário.
          </p>

          <h3>Decisões baseadas em conteúdo</h3>
          <p>
            Reviews, tierlists, comparações e conteúdos editoriais não constituem garantia de
            satisfação com determinado produto.
          </p>
          <p>
            O usuário deverá considerar suas próprias necessidades, preferências e condições antes
            de realizar uma compra.
          </p>

          <h3>Serviços de terceiros</h3>
          <p>
            O Sunano não controla integralmente sites, lojas, fabricantes, serviços, APIs ou
            plataformas externas.
          </p>
          <p>
            Quando determinado dano decorrer exclusivamente de ato de terceiro fora da esfera de
            responsabilidade legal do Sunano, será observada a responsabilidade do respectivo agente.
          </p>

          <h3>Conduta do usuário</h3>
          <p>O Sunano não será responsável por prejuízos decorrentes exclusivamente de:</p>
          <ul>
            <li>utilização da plataforma em desacordo com estes Termos;</li>
            <li>divulgação voluntária de credenciais pelo próprio usuário;</li>
            <li>utilização indevida das funcionalidades;</li>
            <li>conteúdo ilícito publicado pelo usuário;</li>
            <li>fraude ou manipulação praticada pelo usuário;</li>
            <li>exploração deliberada de vulnerabilidades;</li>
            <li>atos exclusivos de terceiros fora da responsabilidade legal do Sunano.</li>
          </ul>
          <p className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
            <strong>
              Nada nesta seção exclui ou limita responsabilidades que não possam ser afastadas pela
              legislação brasileira.
            </strong>
          </p>
        </section>

        <section>
          <h2>11. Privacidade e Proteção de Dados</h2>
          <p>
            O tratamento de dados pessoais realizado pelo Sunano é disciplinado pela{" "}
            <Link href="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </Link>
            , disponível em página própria.
          </p>
          <p>A Política de Privacidade contém informações sobre:</p>
          <ul>
            <li>dados tratados;</li>
            <li>finalidades;</li>
            <li>bases legais;</li>
            <li>compartilhamento;</li>
            <li>armazenamento;</li>
            <li>cookies;</li>
            <li>segurança;</li>
            <li>retenção;</li>
            <li>direitos dos titulares;</li>
            <li>canais relacionados à proteção de dados.</li>
          </ul>
          <p>
            Ao utilizar o Sunano, o usuário também deverá respeitar a privacidade de terceiros e não
            utilizar a plataforma para obter, publicar ou compartilhar dados pessoais de forma
            ilícita.
          </p>
        </section>

        <section>
          <h2>12. Alterações dos Termos e da Plataforma</h2>
          <p>
            O Sunano poderá{" "}
            <strong>alterar, atualizar, corrigir ou aprimorar estes Termos ao longo do tempo</strong>
            , sempre que necessário para acompanhar a evolução da plataforma, de suas funcionalidades
            ou da legislação aplicável.
          </p>
          <p>As alterações poderão ocorrer, entre outros motivos, em razão de:</p>
          <ul>
            <li>novas funcionalidades;</li>
            <li>aprimoramento de serviços existentes;</li>
            <li>alterações nas regras da comunidade;</li>
            <li>mudanças no sistema de Aura;</li>
            <li>novas medidas de segurança;</li>
            <li>prevenção de fraude e abuso;</li>
            <li>mudanças técnicas;</li>
            <li>alterações em prestadores ou serviços utilizados;</li>
            <li>alterações legais ou regulatórias;</li>
            <li>determinações de autoridades competentes;</li>
            <li>correções;</li>
            <li>esclarecimentos;</li>
            <li>melhorias na redação.</li>
          </ul>
          <p>
            A versão vigente será disponibilizada no Sunano com sua respectiva versão ou data de
            atualização.
          </p>
          <p>
            Quando uma alteração for relevante, o Sunano poderá comunicá-la por aviso na plataforma,
            e-mail, notificação na conta ou outro meio adequado.
          </p>
          <p>
            Alterações necessárias para segurança, prevenção de fraude, cumprimento da legislação,
            atendimento de ordem de autoridade ou correção de situação urgente poderão ser
            implementadas assim que necessário.
          </p>
          <p>
            As alterações produzirão efeitos a partir da data indicada na nova versão ou, quando não
            houver indicação específica, de sua publicação.
          </p>
          <p>
            Quando a legislação exigir manifestação específica do usuário, o Sunano adotará o
            procedimento correspondente.
          </p>
          <p>
            Caso o usuário não concorde com a versão vigente, poderá deixar de utilizar a plataforma
            e, quando aplicável, solicitar a exclusão de sua conta.
          </p>

          <h3>Direitos já constituídos</h3>
          <p>
            Alterações destes Termos não serão utilizadas retroativamente para eliminar ou reduzir
            direitos legalmente constituídos.
          </p>

          <h3>Alterações nas funcionalidades</h3>
          <p>
            O Sunano poderá modificar, substituir, suspender ou encerrar funcionalidades conforme a
            evolução da plataforma.
          </p>
          <p>Isso poderá ocorrer especialmente com funcionalidades:</p>
          <ul>
            <li>gratuitas;</li>
            <li>experimentais;</li>
            <li>em fase beta;</li>
            <li>promocionais;</li>
            <li>pouco utilizadas;</li>
            <li>tecnicamente inviáveis;</li>
            <li>substituídas por outras;</li>
            <li>que apresentem risco relevante de fraude, abuso ou segurança.</li>
          </ul>
          <p>
            Quando houver obrigações pendentes ou direitos legalmente constituídos relacionados à
            funcionalidade, eles serão tratados de acordo com a legislação e as condições aplicáveis.
          </p>
        </section>

        <section>
          <h2>13. Lei Aplicável, Foro e Contato</h2>
          <p>
            Estes Termos são regidos pelas leis da{" "}
            <strong>República Federativa do Brasil</strong>.
          </p>
          <p>
            Nenhuma disposição deverá ser interpretada como renúncia a direitos legalmente
            irrenunciáveis.
          </p>
          <p>
            Caso determinada cláusula seja considerada inválida ou inexequível, as demais disposições
            continuarão válidas na medida permitida pela legislação.
          </p>

          <h3>Foro</h3>
          <p>
            Nas relações de consumo, serão respeitadas as regras de competência previstas na
            legislação brasileira, inclusive o direito do consumidor de utilizar o foro de seu
            domicílio quando aplicável.
          </p>
          <p>
            Nos demais casos, será observado o foro competente de acordo com a legislação brasileira.
          </p>

          <h3>Contato</h3>
          <p>
            Para dúvidas, solicitações relacionadas aos Termos ou questões gerais sobre a plataforma:
          </p>
          <p>
            <strong>E-mail:</strong>{" "}
            <a href="mailto:contato@sunano.gg" className="text-primary hover:underline">
              contato@sunano.gg
            </a>
          </p>
          <p>
            Também poderá ser utilizada a{" "}
            <Link href="/suporte" className="text-primary hover:underline">
              Central de Tickets do Sunano
            </Link>
            .
          </p>
        </section>

      </div>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Versão {CURRENT_VERSION} · Última atualização: 31 de agosto de 2026.{" "}
          <Link href="/privacidade" className="text-primary hover:underline">
            Política de Privacidade
          </Link>
          {" · "}
          <Link href="/informacoes" className="text-primary hover:underline">
            Central de Informações
          </Link>
        </p>
      </footer>
    </article>
  )
}
