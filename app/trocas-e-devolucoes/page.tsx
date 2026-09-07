import Link from "next/link"
import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Trocas, Devoluções e Garantia",
  description: "Política de trocas, devoluções, garantia e direito de arrependimento das compras na Loja Sunano, com prazos e como solicitar.",
  path: "/trocas-e-devolucoes",
  eyebrow: "Legal",
  subtitle: "Prazos, garantia e como solicitar",
})

const CURRENT_VERSION = "2026-09"

export default function TrocasEDevolucoesPage() {
  return (
    <article className="mx-auto max-w-3xl px-2 py-10 sm:px-4 md:px-6">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Trocas, Devoluções e Garantia
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Política de trocas, devoluções e garantia
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Versão <strong>{CURRENT_VERSION}</strong> · Última atualização: 31 de agosto de 2026.
        </p>
      </header>

      <div className="prose prose-sm prose-invert max-w-none space-y-8 text-foreground/90 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:leading-relaxed [&_ul]:my-3 [&_ul]:space-y-1 [&_ol]:my-3 [&_ol]:space-y-1 [&_li]:text-sm">

        <section>
          <p>
            Esta Política de Trocas, Devoluções e Garantia estabelece as condições aplicáveis aos
            produtos adquiridos por meio do <strong>Sunano</strong>, incluindo produtos
            comercializados em parceria com fabricantes, distribuidores e fornecedores nacionais ou
            internacionais.
          </p>
          <p>
            O Sunano busca disponibilizar produtos de tecnologia, periféricos, hardware e outros
            itens relacionados com preços competitivos para o mercado brasileiro, trabalhando com uma
            rede de fabricantes, distribuidores e fornecedores parceiros responsáveis pelo
            fornecimento e, em determinados casos, pelo envio dos produtos diretamente de sua origem.
          </p>
          <p>
            Esta Política deve ser interpretada em conjunto com os{" "}
            <Link href="/termos" className="text-primary hover:underline">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </Link>{" "}
            do Sunano, bem como com a legislação brasileira aplicável, especialmente o{" "}
            <strong>Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong>.
          </p>
          <p>
            Nenhuma disposição desta Política tem como objetivo excluir, restringir ou substituir
            direitos assegurados ao consumidor por normas de aplicação obrigatória.
          </p>
        </section>

        <section>
          <h2>1. Como funciona a venda em parceria com fabricantes e fornecedores</h2>
          <p>
            O Sunano trabalha com fabricantes, distribuidores e fornecedores parceiros para
            disponibilizar determinados produtos em sua plataforma.
          </p>
          <p>Dependendo do produto adquirido, o pedido poderá ser preparado e enviado:</p>
          <ul>
            <li>pelo próprio Sunano;</li>
            <li>por um armazém parceiro;</li>
            <li>pelo fabricante;</li>
            <li>por um distribuidor;</li>
            <li>ou por outro fornecedor responsável pela operação logística.</li>
          </ul>
          <p>
            Em determinados casos, o produto poderá ser enviado{" "}
            <strong>diretamente da origem ao endereço informado pelo consumidor</strong>, sem passar
            fisicamente pelo estoque do Sunano.
          </p>
          <p>
            Essa estrutura permite reduzir determinadas etapas de armazenamento e logística,
            possibilitando que alguns produtos sejam oferecidos por preços mais competitivos ao
            consumidor brasileiro.
          </p>
          <p>
            O fato de determinado produto ser enviado diretamente por um fabricante ou fornecedor
            parceiro não altera, por si só, os direitos do consumidor decorrentes da contratação
            realizada por meio do Sunano.
          </p>
          <p>
            O Sunano poderá acompanhar a operação e prestar atendimento ao consumidor, inclusive
            intermediando a comunicação com fabricantes, fornecedores e operadores logísticos quando
            necessário.
          </p>
        </section>

        <section id="arrependimento">
          <h2>2. Direito de arrependimento</h2>
          <p>
            Nas compras realizadas pela internet que estejam submetidas ao Código de Defesa do
            Consumidor, o consumidor poderá exercer o <strong>direito de arrependimento</strong>,
            conforme previsto no art. 49 do CDC.
          </p>
          <p>
            O prazo legal é de <strong>7 (sete) dias corridos</strong>, contado na forma estabelecida
            pela legislação aplicável, normalmente a partir do recebimento do produto.
          </p>
          <p>
            O consumidor não precisa apresentar justificativa para exercer o direito de
            arrependimento.
          </p>
          <p>
            Para exercer esse direito, o consumidor deverá entrar em contato com o Sunano pelos
            canais oficiais ou{" "}
            <Link href="/suporte" className="text-primary hover:underline">
              abrir um ticket de atendimento
            </Link>
            .
          </p>
        </section>

        <section>
          <h2>3. Devolução por arrependimento</h2>
          <p>
            O consumidor não deverá enviar o produto por conta própria antes de receber as instruções
            oficiais do Sunano.
          </p>
          <p>
            Após a solicitação, o Sunano fornecerá as orientações necessárias para a devolução do
            produto ao endereço, armazém ou parceiro logístico indicado.
          </p>
          <p>
            Quando a devolução decorrer do exercício regular do direito de arrependimento previsto no
            art. 49 do CDC, <strong>os custos necessários para a devolução serão suportados pelo
            Sunano</strong>, observada a legislação aplicável.
          </p>
          <p>
            O consumidor poderá ser orientado a realizar a postagem em agência dos Correios,
            transportadora, ponto de coleta ou outro local indicado pelo Sunano, mediante etiqueta,
            código de postagem ou procedimento de logística reversa.
          </p>
          <p className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
            <strong>
              O consumidor não deverá contratar ou pagar por serviços de transporte por iniciativa
              própria antes de receber autorização e instruções do Sunano.
            </strong>
          </p>
          <p>
            Caso o consumidor realize o envio por conta própria sem seguir as instruções fornecidas,
            o eventual reembolso de despesas de transporte dependerá da análise do caso e da
            legislação aplicável.
          </p>
          <p>Sempre que possível, o produto deverá ser devolvido acompanhado de:</p>
          <ul>
            <li>embalagem;</li>
            <li>acessórios;</li>
            <li>manuais;</li>
            <li>cabos;</li>
            <li>adaptadores;</li>
            <li>brindes;</li>
            <li>demais itens enviados junto com o pedido.</li>
          </ul>
          <p>
            A abertura da embalagem, por si só, não elimina automaticamente o direito de
            arrependimento.
          </p>
          <p>
            O consumidor deverá, entretanto, preservar o produto e seus componentes durante o período
            em que estiver em sua posse e evitar utilização além do necessário para verificar sua
            natureza, características e funcionamento, observados os direitos previstos na legislação
            aplicável.
          </p>
        </section>

        <section>
          <h2>4. Vídeo de unboxing</h2>
          <p>
            O Sunano <strong>recomenda fortemente</strong> que o consumidor grave todo o processo de
            abertura da encomenda.
          </p>
          <p>O vídeo poderá auxiliar na comprovação de:</p>
          <ul>
            <li>condição da embalagem;</li>
            <li>etiqueta de envio;</li>
            <li>lacres, quando existentes;</li>
            <li>produto recebido;</li>
            <li>acessórios;</li>
            <li>danos;</li>
            <li>produto diferente do adquirido;</li>
            <li>ausência de componentes;</li>
            <li>defeitos aparentes.</li>
          </ul>
          <p>
            O vídeo de unboxing poderá facilitar significativamente a análise de ocorrências
            relacionadas ao transporte ou ao conteúdo da encomenda.
          </p>
          <p>
            Entretanto,{" "}
            <strong>
              a ausência de vídeo de unboxing não implica, por si só, perda automática dos direitos
              do consumidor
            </strong>
            .
          </p>
          <p>
            Outras evidências poderão ser apresentadas e analisadas, incluindo fotografias, vídeos
            realizados posteriormente, informações de rastreamento, registros da transportadora e
            demais elementos disponíveis.
          </p>
        </section>

        <section id="trocas-por-defeito">
          <h2>5. Produto com defeito</h2>
          <p>
            Caso o produto apresente defeito, o consumidor deverá{" "}
            <Link href="/suporte" className="text-primary hover:underline">
              abrir um ticket no Sunano
            </Link>{" "}
            informando o problema.
          </p>
          <p>Para facilitar e agilizar a análise, poderão ser solicitados:</p>
          <ul>
            <li>descrição detalhada do defeito;</li>
            <li>fotografias;</li>
            <li>vídeos demonstrando o problema;</li>
            <li>número de série;</li>
            <li>versão do firmware;</li>
            <li>sistema operacional;</li>
            <li>equipamento utilizado;</li>
            <li>informações sobre instalação e configuração;</li>
            <li>comprovante do pedido;</li>
            <li>outras informações técnicas relevantes.</li>
          </ul>
          <p>Quando necessário, poderá ser solicitada a devolução do produto para análise.</p>
          <p>
            O procedimento de análise técnica não elimina nem limita os direitos previstos na
            legislação consumerista.
          </p>
        </section>

        <section>
          <h2>6. Garantia legal</h2>
          <p>
            Os produtos comercializados pelo Sunano estão sujeitos à{" "}
            <strong>garantia legal prevista na legislação brasileira</strong>, quando aplicável.
          </p>
          <p>A garantia legal independe de eventual garantia adicional oferecida pelo fabricante.</p>
          <p>
            O prazo e os procedimentos aplicáveis dependerão da natureza do produto, do defeito
            identificado e da legislação vigente.
          </p>
          <p>
            Quando houver garantia contratual ou garantia adicional oferecida pelo fabricante, suas
            condições poderão ser apresentadas na página do produto, documentação que acompanha a
            mercadoria ou nos canais oficiais de atendimento.
          </p>
        </section>

        <section>
          <h2>7. Garantia do fabricante</h2>
          <p>
            Alguns produtos comercializados pelo Sunano poderão possuir garantia adicional oferecida
            diretamente pelo fabricante ou fornecedor.
          </p>
          <p>
            Em determinados casos, especialmente em produtos de origem internacional, o acionamento
            da garantia poderá exigir contato e análise diretamente com o fabricante, distribuidor ou
            fornecedor responsável.
          </p>
          <p>
            Quando necessário, o Sunano poderá auxiliar o consumidor durante esse processo, inclusive
            intermediando a comunicação com o fabricante ou fornecedor parceiro.
          </p>

          <h3>7.1. Garantias internacionais e prazo de atendimento</h3>
          <p>
            Como parte dos produtos comercializados pelo Sunano poderá ter origem internacional,
            determinados processos de garantia podem envolver{" "}
            <strong>
              transporte internacional, análise técnica no exterior, comunicação com fabricantes
              estrangeiros, procedimentos alfandegários e posterior retorno do produto ao Brasil
            </strong>
            .
          </p>
          <p>
            Por essa razão, processos relacionados à garantia internacional poderão apresentar{" "}
            <strong>prazo de atendimento superior ao de uma ocorrência realizada exclusivamente em
            território nacional</strong>.
          </p>
          <p>
            O consumidor deverá considerar a natureza internacional da operação e ter ciência de que
            determinadas etapas dependem de terceiros, como fabricantes, fornecedores,
            transportadoras e autoridades aduaneiras.
          </p>
          <p>
            O Sunano buscará acompanhar o processo e manter o consumidor informado sobre atualizações
            relevantes, sempre que houver informações disponíveis.
          </p>
          <p>
            O fato de um processo de garantia internacional exigir maior prazo não significa abandono
            do atendimento. O Sunano continuará prestando suporte dentro das possibilidades da
            operação e buscará a solução adequada para cada caso.
          </p>
          <p>
            Quando houver possibilidade de solução local, substituição ou outro procedimento mais
            rápido, o Sunano poderá avaliar a alternativa conforme a disponibilidade do produto, do
            fornecedor e as condições aplicáveis ao pedido.
          </p>
        </section>

        <section>
          <h2>8. Produto diferente do solicitado</h2>
          <p>
            Caso o consumidor receba um produto diferente daquele adquirido, deverá comunicar o
            Sunano assim que identificar a divergência.
          </p>
          <p>Recomenda-se não utilizar o produto até que o caso seja analisado.</p>
          <p>Poderão ser solicitados:</p>
          <ul>
            <li>fotografias do produto;</li>
            <li>fotografias da embalagem;</li>
            <li>etiqueta de envio;</li>
            <li>código de rastreamento;</li>
            <li>vídeo de abertura da encomenda;</li>
            <li>número do pedido;</li>
            <li>número de série, quando aplicável.</li>
          </ul>
          <p>
            Após a confirmação da divergência, o Sunano providenciará a solução adequada, que poderá
            incluir substituição, devolução ou restituição do valor, conforme o caso e a legislação
            aplicável.
          </p>
          <p>
            Quando o erro for de responsabilidade do Sunano, fornecedor ou parceiro logístico, o
            consumidor não deverá arcar com custos que legalmente sejam de responsabilidade do
            fornecedor.
          </p>
        </section>

        <section>
          <h2>9. Produto danificado durante o transporte</h2>
          <p>
            Recomendamos que o consumidor verifique a <strong>condição externa da encomenda</strong>{" "}
            no momento do recebimento.
          </p>
          <p>Consideram-se especialmente relevantes sinais de <strong>dano físico visível</strong>, como:</p>
          <ul>
            <li>embalagem amassada de forma significativa;</li>
            <li>rasgos;</li>
            <li>perfurações;</li>
            <li>esmagamentos;</li>
            <li>sinais de impacto;</li>
            <li>embalagem molhada;</li>
            <li>conteúdo exposto;</li>
            <li>violação evidente;</li>
            <li>componentes ou partes do produto visivelmente danificados;</li>
            <li>outros sinais aparentes de que o produto possa ter sofrido danos durante o transporte.</li>
          </ul>

          <h3>9.1. Procedimento em caso de dano visível</h3>
          <p>
            Caso o consumidor identifique sinais de dano físico visível na embalagem no momento da
            entrega, recomendamos que registre fotografias e, sempre que possível, realize um vídeo
            antes da abertura da encomenda.
          </p>
          <p className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
            <strong>
              Salvo orientação expressa do Sunano, recomendamos que o consumidor receba a encomenda e
              não recuse o recebimento.
            </strong>
          </p>
          <p>
            Essa orientação é especialmente importante para produtos enviados de origem
            internacional, nos quais a recusa da entrega pode resultar em procedimentos logísticos ou
            aduaneiros que dificultem ou impeçam o retorno regular da encomenda ao fornecedor ou ao
            armazém responsável pelo atendimento.
          </p>
          <p>
            Após receber a encomenda, caso seja identificado qualquer dano no produto ou em seus
            componentes, o consumidor deverá abrir um ticket no Sunano e enviar as evidências
            disponíveis.
          </p>
          <p>
            Quando for necessária a devolução, o Sunano fornecerá as instruções correspondentes e,
            quando aplicável, disponibilizará{" "}
            <strong>
              etiqueta de postagem, código de logística reversa ou outra modalidade de envio
              previamente autorizada
            </strong>
            , indicando o endereço do armazém responsável pelo recebimento da devolução.
          </p>
          <p>
            <strong>
              O consumidor não deverá enviar o produto para o fabricante, fornecedor, transportadora
              ou qualquer outro endereço por iniciativa própria
            </strong>
            , salvo quando expressamente autorizado pelo Sunano.
          </p>
          <p>
            Essa medida busca garantir que a encomenda seja direcionada ao local correto e possa ser
            devidamente identificada, recebida e processada pelo sistema de atendimento do Sunano.
          </p>
          <p>
            O recebimento da encomenda pelo consumidor não significa reconhecimento de que o produto
            foi entregue em perfeitas condições. Eventuais danos identificados posteriormente à
            abertura poderão ser comunicados ao Sunano para análise.
          </p>
        </section>

        <section>
          <h2>10. Lacres, selagem e embalagem do produto</h2>
          <p>
            A ausência de lacre plástico, selo adesivo, película externa ou outro tipo de embalagem
            selada <strong>não significa, por si só, que o produto tenha sido aberto, usado ou
            violado</strong>.
          </p>
          <p>
            A forma de embalagem varia de acordo com o fabricante, modelo, lote e região de
            comercialização.
          </p>
          <p>Determinados produtos podem ser comercializados originalmente:</p>
          <ul>
            <li>sem plástico externo;</li>
            <li>sem lacre adesivo;</li>
            <li>com caixa sem selo de segurança;</li>
            <li>com embalagem que permite abertura e fechamento;</li>
            <li>com acessórios acondicionados de maneira diferente;</li>
            <li>ou com outros métodos de embalagem definidos pelo próprio fabricante.</li>
          </ul>
          <p>
            Portanto, a simples ausência de um lacre ou plástico externo{" "}
            <strong>não constitui, isoladamente, evidência de produto usado ou previamente aberto</strong>.
          </p>
          <p>
            Caso o consumidor identifique sinais que indiquem efetivamente possível uso anterior,
            violação, dano ou divergência em relação às características normalmente apresentadas pelo
            fabricante, deverá registrar fotografias e/ou vídeos e entrar em contato com o Sunano para
            análise.
          </p>
        </section>

        <section>
          <h2>11. Produto incompleto</h2>
          <p>
            Caso o produto seja recebido sem algum acessório, componente ou item anunciado na oferta,
            o consumidor deverá comunicar o Sunano.
          </p>
          <p>
            Poderão ser solicitadas fotografias, vídeos e informações sobre o conteúdo recebido.
          </p>
          <p>Após a análise, o Sunano poderá providenciar a solução adequada, que poderá incluir:</p>
          <ul>
            <li>envio do item faltante;</li>
            <li>substituição do produto;</li>
            <li>devolução;</li>
            <li>restituição proporcional ou integral, conforme o caso;</li>
            <li>outra solução legalmente aplicável.</li>
          </ul>
        </section>

        <section>
          <h2>12. Mau uso do produto</h2>
          <p>
            O Sunano não será responsável por danos{" "}
            <strong>comprovadamente causados por mau uso do produto</strong>, observadas as
            disposições legais aplicáveis.
          </p>
          <p>Podem ser considerados exemplos de mau uso:</p>
          <ul>
            <li>quedas;</li>
            <li>impactos;</li>
            <li>contato com líquidos;</li>
            <li>utilização fora das especificações;</li>
            <li>instalação incorreta;</li>
            <li>modificações físicas;</li>
            <li>modificações elétricas;</li>
            <li>desmontagem inadequada;</li>
            <li>utilização de componentes incompatíveis;</li>
            <li>reparos realizados por pessoas não autorizadas;</li>
            <li>danos causados por acidentes;</li>
            <li>utilização em desacordo com as instruções do fabricante.</li>
          </ul>
          <p>
            A exclusão de responsabilidade dependerá da existência de relação entre a conduta do
            consumidor e o dano ou defeito identificado.
          </p>
          <p>
            Defeitos preexistentes ou problemas que não tenham sido causados pelo consumidor
            continuarão sujeitos aos direitos previstos na legislação aplicável.
          </p>
        </section>

        <section>
          <h2>13. Firmware, software e &ldquo;brick&rdquo;</h2>
          <p>
            Alguns periféricos e componentes comercializados pelo Sunano podem permitir atualizações
            de firmware ou software.
          </p>
          <p>O consumidor deve seguir cuidadosamente as instruções fornecidas pelo fabricante.</p>
          <p>
            O Sunano não será responsável por danos{" "}
            <strong>
              comprovadamente causados por procedimentos realizados pelo consumidor em desacordo com
              as instruções oficiais do fabricante
            </strong>
            .
          </p>
          <p>Isso poderá incluir:</p>
          <ul>
            <li>instalação de firmware não oficial;</li>
            <li>instalação de firmware destinado a outro modelo;</li>
            <li>utilização de firmware modificado;</li>
            <li>utilização deliberada de versões experimentais ou não recomendadas;</li>
            <li>interrupção indevida de uma atualização;</li>
            <li>desligamento do equipamento durante procedimento crítico;</li>
            <li>utilização de ferramentas incompatíveis;</li>
            <li>alteração indevida de arquivos internos do dispositivo.</li>
          </ul>
          <p>
            Caso o produto seja inutilizado (&ldquo;brick&rdquo;) durante um procedimento realizado
            pelo consumidor, o caso poderá ser analisado pelo suporte do Sunano e/ou pelo fabricante.
          </p>
          <p>
            O Sunano buscará auxiliar o consumidor na medida do possível, porém o atendimento técnico
            não representa garantia de recuperação do produto.
          </p>

          <h3>13.1. Firmware oficial</h3>
          <p>
            Caso o problema seja causado por uma atualização{" "}
            <strong>oficial disponibilizada pelo próprio fabricante</strong>, a situação será
            analisada individualmente e não será automaticamente considerada mau uso do consumidor.
          </p>
        </section>

        <section>
          <h2>14. Produtos modificados</h2>
          <p>
            Produtos que tenham sido fisicamente ou eletronicamente modificados pelo consumidor
            poderão ter sua cobertura de garantia afetada quando a modificação for responsável pelo
            defeito apresentado.
          </p>
          <p>Podem ser considerados exemplos:</p>
          <ul>
            <li>troca de switches;</li>
            <li>soldagem;</li>
            <li>dessoldagem;</li>
            <li>alteração de componentes;</li>
            <li>alteração da placa;</li>
            <li>modificações elétricas;</li>
            <li>alterações estruturais;</li>
            <li>pintura ou alterações físicas que afetem o funcionamento;</li>
            <li>instalação de componentes incompatíveis.</li>
          </ul>
          <p>
            Caso o consumidor tenha realizado modificações, deverá informar o fato ao suporte do
            Sunano.
          </p>
        </section>

        <section>
          <h2>15. Incompatibilidade</h2>
          <p>
            O consumidor é responsável por verificar as características e requisitos de
            compatibilidade do produto antes da compra.
          </p>
          <p>Isso inclui, quando aplicável:</p>
          <ul>
            <li>sistema operacional;</li>
            <li>conexão;</li>
            <li>compatibilidade de software;</li>
            <li>compatibilidade de hardware;</li>
            <li>dimensões;</li>
            <li>padrões de conexão;</li>
            <li>requisitos de energia;</li>
            <li>versões de firmware;</li>
            <li>demais requisitos informados pelo fabricante.</li>
          </ul>
          <p>
            O Sunano buscará apresentar essas informações de forma clara na página de cada produto.
          </p>
          <p>
            Quando a incompatibilidade decorrer exclusivamente das características do equipamento do
            consumidor, sem defeito ou divergência na oferta do produto, o caso será analisado de
            acordo com a natureza da contratação e a legislação aplicável.
          </p>
        </section>

        <section>
          <h2>16. Envio direto da origem</h2>
          <p>
            Determinados produtos poderão ser enviados diretamente de fabricantes, distribuidores ou
            fornecedores parceiros.
          </p>
          <p>Isso poderá ocorrer tanto em operações nacionais quanto internacionais.</p>
          <p>
            O endereço de origem da encomenda poderá, portanto, ser diferente do endereço comercial
            ou operacional do Sunano.
          </p>
          <p>
            Essa característica faz parte do modelo de operação e busca reduzir etapas logísticas e
            possibilitar preços mais competitivos.
          </p>
          <p>
            Quando o produto for enviado do exterior, o consumidor será informado sobre as condições
            de envio e eventuais particularidades aplicáveis à operação, conforme exigido pela
            legislação.
          </p>
        </section>

        <section>
          <h2>17. Prazos de entrega</h2>
          <p>
            O prazo de entrega será informado ao consumidor durante o processo de compra,
            considerando as informações disponíveis para cada produto.
          </p>
          <p>Em produtos enviados diretamente da origem, o prazo poderá depender de:</p>
          <ul>
            <li>processamento do fornecedor;</li>
            <li>preparação do pedido;</li>
            <li>transporte nacional ou internacional;</li>
            <li>fiscalização;</li>
            <li>procedimentos aduaneiros;</li>
            <li>condições climáticas;</li>
            <li>restrições logísticas;</li>
            <li>greves;</li>
            <li>eventos de força maior;</li>
            <li>outros fatores externos.</li>
          </ul>
          <p>
            O prazo apresentado ao consumidor será observado conforme as condições da oferta e a
            legislação aplicável.
          </p>
          <p>
            Caso ocorra atraso relevante, o consumidor poderá entrar em contato com o Sunano para
            obter informações sobre o pedido e as alternativas disponíveis.
          </p>
        </section>

        <section>
          <h2>18. Rastreamento</h2>
          <p>
            Quando disponível, o Sunano fornecerá ao consumidor o código de rastreamento do pedido.
          </p>
          <p>
            O rastreamento poderá ser realizado diretamente no sistema da transportadora, serviço
            postal ou operador logístico responsável.
          </p>
          <p>
            Eventuais diferenças entre as informações apresentadas no Sunano e no sistema da
            transportadora poderão ocorrer devido ao tempo de sincronização das informações.
          </p>
        </section>

        <section>
          <h2>19. Pedido extraviado ou não entregue</h2>
          <p>
            Caso o rastreamento indique extravio, perda ou impossibilidade definitiva de entrega, o
            consumidor deverá entrar em contato com o Sunano.
          </p>
          <p>
            O Sunano poderá abrir uma investigação junto ao fornecedor, transportadora ou operador
            logístico.
          </p>
          <p>
            Após a confirmação da ocorrência, será adotada a solução adequada conforme o caso e a
            legislação aplicável, podendo incluir:
          </p>
          <ul>
            <li>reenvio;</li>
            <li>substituição;</li>
            <li>restituição;</li>
            <li>outra solução legalmente aplicável.</li>
          </ul>
        </section>

        <section>
          <h2>20. Importação e procedimentos aduaneiros</h2>
          <p>
            Produtos enviados do exterior poderão estar sujeitos às regras brasileiras de importação,
            tributação e fiscalização aduaneira.
          </p>
          <p>
            Quando houver incidência de tributos, tarifas ou outros encargos de responsabilidade do
            consumidor, as informações relevantes serão apresentadas de forma clara antes da conclusão
            da compra, quando aplicável.
          </p>
          <p>
            Caso uma encomenda seja submetida a fiscalização ou procedimento aduaneiro, o Sunano
            buscará auxiliar o consumidor na identificação da situação e na orientação sobre os
            próximos passos.
          </p>
        </section>

        <section>
          <h2>21. Cancelamento antes do envio</h2>
          <p>
            Caso o consumidor deseje cancelar o pedido antes do envio, deverá entrar em contato com o
            Sunano o mais rápido possível.
          </p>
          <p>
            Se o pedido ainda não tiver sido processado pelo fornecedor, o Sunano buscará interromper
            a operação.
          </p>
          <p>
            Caso o pedido já tenha sido processado ou enviado, poderá ser necessário seguir o
            procedimento de devolução correspondente.
          </p>
          <p>
            Nenhum procedimento interno de processamento poderá afastar direitos legalmente
            assegurados ao consumidor.
          </p>
        </section>

        <section>
          <h2>22. Pedido já enviado</h2>
          <p>
            Caso o consumidor solicite o cancelamento depois que o pedido já tenha sido enviado, o
            Sunano poderá orientar o consumidor sobre o procedimento adequado.
          </p>
          <p className="mt-4 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
            <strong>
              O consumidor não deverá recusar a encomenda ou realizar qualquer procedimento de
              devolução por iniciativa própria sem orientação do Sunano
            </strong>
            , especialmente quando se tratar de produto enviado internacionalmente.
          </p>
          <p>Dependendo da situação, poderá ser necessário:</p>
          <ul>
            <li>aguardar o recebimento;</li>
            <li>receber a encomenda e solicitar a devolução;</li>
            <li>utilizar uma etiqueta de logística reversa fornecida pelo Sunano;</li>
            <li>ou seguir outro procedimento indicado pelo atendimento.</li>
          </ul>
        </section>

        <section>
          <h2>23. Reembolso</h2>
          <p>
            Quando houver direito à restituição, o Sunano iniciará o procedimento de reembolso
            conforme a modalidade aplicável.
          </p>
          <p>
            O prazo para que o valor esteja efetivamente disponível na conta ou fatura do consumidor
            poderá depender da instituição financeira, administradora do cartão ou intermediador de
            pagamento.
          </p>

          <h3>23.1. Cartão de crédito</h3>
          <p>O estorno será solicitado ao intermediador de pagamento responsável pela transação.</p>
          <p>
            O momento em que o crédito aparecer na fatura poderá variar conforme a instituição
            financeira.
          </p>

          <h3>23.2. PIX</h3>
          <p>
            Quando aplicável, a restituição será realizada por meio do procedimento adequado à
            transação original, observadas as regras do sistema de pagamento utilizado.
          </p>
          <p>O consumidor será informado quando o processo de restituição for iniciado.</p>
        </section>

        <section>
          <h2>24. Devoluções de produtos enviados do exterior</h2>
          <p>
            Quando um produto tiver sido enviado diretamente do exterior, o procedimento de devolução
            poderá exigir logística específica.
          </p>
          <p>
            O consumidor{" "}
            <strong>
              não deverá enviar o produto diretamente para qualquer endereço encontrado na internet
              ou fornecido informalmente por terceiros
            </strong>
            .
          </p>
          <p>Antes de realizar qualquer envio, deverá aguardar as instruções oficiais do Sunano.</p>
          <p>
            Quando houver necessidade de devolução internacional ou nacional para um armazém
            responsável pelo processamento da devolução, o Sunano informará o procedimento aplicável.
          </p>
          <p>
            Quando disponível, poderá ser fornecida etiqueta de postagem, código de logística reversa
            ou outra forma de autorização para o envio.
          </p>
        </section>

        <section>
          <h2>25. Custos de devolução</h2>
          <p>
            Quando a devolução decorrer de uma situação cuja responsabilidade seja do Sunano,
            fornecedor ou parceiro logístico, como produto incorreto, defeito coberto ou outra
            hipótese legal, os custos serão tratados de acordo com a legislação aplicável.
          </p>
          <p>
            No caso de exercício regular do direito de arrependimento previsto no art. 49 do CDC, o
            consumidor não será obrigado a suportar o custo da logística reversa como condição para
            exercer esse direito.
          </p>
          <p>
            Em outras situações, os custos serão analisados conforme a causa da devolução e a
            legislação aplicável.
          </p>
        </section>

        <section>
          <h2>26. Produto indisponível após a compra</h2>
          <p>
            Caso, excepcionalmente, um produto adquirido deixe de estar disponível por motivo alheio
            ao consumidor, o Sunano entrará em contato para apresentar uma solução adequada.
          </p>
          <p>Dependendo da situação, poderão ser apresentadas alternativas como:</p>
          <ul>
            <li>substituição por produto equivalente, mediante concordância do consumidor;</li>
            <li>reembolso;</li>
            <li>cancelamento;</li>
            <li>outra solução legalmente aplicável.</li>
          </ul>
        </section>

        <section>
          <h2>27. Erro no endereço de entrega</h2>
          <p>
            O consumidor é responsável por fornecer informações corretas e completas para entrega.
          </p>
          <p>
            Caso o pedido não possa ser entregue em razão de endereço incorreto ou incompleto
            informado pelo consumidor, o Sunano poderá solicitar informações adicionais para tentativa
            de solução.
          </p>
          <p>
            Eventuais custos adicionais decorrentes exclusivamente de informações incorretas
            fornecidas pelo consumidor serão analisados conforme a legislação aplicável e as condições
            da contratação.
          </p>
        </section>

        <section>
          <h2>28. Situações de fraude ou abuso</h2>
          <p>
            O Sunano poderá investigar situações que apresentem indícios de fraude relacionadas a
            pedidos, devoluções, garantias ou reembolsos.
          </p>
          <p>Podem ser considerados indícios de fraude ou abuso:</p>
          <ul>
            <li>adulteração de número de série;</li>
            <li>envio de produto diferente do adquirido;</li>
            <li>falsificação de evidências;</li>
            <li>dano proposital;</li>
            <li>tentativa de obter reembolso sem devolução do produto;</li>
            <li>utilização de produto de terceiro para solicitar garantia;</li>
            <li>apresentação de informações comprovadamente falsas.</li>
          </ul>
          <p>
            A identificação de fraude poderá resultar na adoção das medidas administrativas e
            judiciais cabíveis.
          </p>
          <p>
            O Sunano poderá também restringir determinadas funcionalidades da conta quando necessário
            para proteção da plataforma, dos consumidores e da operação, sempre respeitando a
            legislação aplicável.
          </p>
        </section>

        <section id="como-solicitar">
          <h2>29. Como abrir um ticket</h2>
          <p>
            Todas as solicitações relacionadas a troca, devolução, garantia ou problemas com pedidos
            deverão, preferencialmente, ser realizadas por meio da{" "}
            <Link href="/suporte" className="text-primary hover:underline">
              Central de Tickets do Sunano
            </Link>
            .
          </p>
          <p>Ao abrir um ticket, informe:</p>
          <ul>
            <li>número do pedido;</li>
            <li>produto;</li>
            <li>problema apresentado;</li>
            <li>data de recebimento;</li>
            <li>descrição detalhada.</li>
          </ul>
          <p>Sempre que possível, anexe:</p>
          <ul>
            <li>fotos;</li>
            <li>vídeos;</li>
            <li>comprovantes;</li>
            <li>etiqueta de envio;</li>
            <li>embalagem;</li>
            <li>número de série;</li>
            <li>demais evidências relacionadas ao problema.</li>
          </ul>
          <p>Quanto mais informações forem fornecidas, mais eficiente poderá ser a análise.</p>
        </section>

        <section>
          <h2>30. Atendimento e análise</h2>
          <p>
            O Sunano buscará responder às solicitações dentro de prazo razoável, considerando a
            complexidade de cada caso.
          </p>
          <p>Algumas situações poderão exigir contato com:</p>
          <ul>
            <li>fabricante;</li>
            <li>fornecedor;</li>
            <li>distribuidor;</li>
            <li>transportadora;</li>
            <li>empresa de pagamento;</li>
            <li>operador logístico;</li>
            <li>serviço postal;</li>
            <li>serviço aduaneiro.</li>
          </ul>
          <p>Por esse motivo, determinados processos poderão exigir tempo adicional para conclusão.</p>
          <p>
            O consumidor será informado sempre que houver necessidade de informações adicionais ou
            atualização relevante sobre seu caso.
          </p>
        </section>

        <section id="procon">
          <h2>31. Direitos do consumidor</h2>
          <p>
            Esta Política não substitui nem limita os direitos previstos no Código de Defesa do
            Consumidor ou em outras normas de aplicação obrigatória.
          </p>
          <p>
            Em caso de conflito entre esta Política e uma disposição legal obrigatória, prevalecerá a
            legislação aplicável.
          </p>
          <p>
            Caso não cheguemos a um acordo pelos nossos canais de atendimento, o consumidor também
            poderá recorrer ao PROCON de sua região.
          </p>
        </section>

        <section>
          <h2>32. Alterações desta Política</h2>
          <p>
            O Sunano poderá atualizar esta Política para refletir alterações em seus procedimentos,
            fornecedores, logística, legislação ou modelo de operação.
          </p>
          <p>A versão atualizada estará disponível no site.</p>
          <p>
            Para pedidos já realizados, serão observadas as condições aplicáveis à contratação e os
            direitos previstos na legislação vigente.
          </p>
        </section>

        <section id="contato">
          <h2>33. Contato</h2>
          <p>
            Para solicitações relacionadas a trocas, devoluções, garantia ou problemas com pedidos:
          </p>
          <p>
            <strong>Central de Tickets:</strong>{" "}
            <Link href="/suporte" className="text-primary hover:underline">
              sunano.gg/suporte
            </Link>
            <br />
            <strong>E-mail:</strong>{" "}
            <a href="mailto:contato@sunano.gg" className="text-primary hover:underline">
              contato@sunano.gg
            </a>
          </p>
          <p>
            Os dados cadastrais completos do vendedor estão na página{" "}
            <Link href="/quem-somos" className="text-primary hover:underline">
              Quem Somos
            </Link>
            .
          </p>
        </section>

      </div>

      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>
          Versão {CURRENT_VERSION} · Última atualização: 31 de agosto de 2026.{" "}
          <Link href="/termos" className="text-primary hover:underline">
            Termos de Uso
          </Link>
          {" · "}
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
