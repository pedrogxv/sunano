/**
 * Aviso de versão nova (ChangelogBanner) — chave do localStorage e o script
 * que esconde o aviso antes da primeira pintura.
 *
 * Módulo puro de propósito: o script precisa sair do LAYOUT do servidor
 * (app/layout.tsx), não do componente cliente. Um `<script>` desenhado por
 * componente cliente nunca executa quando o React o cria no navegador, e o
 * React 19 acusa erro toda vez que o banner monta no cliente (troca entre a
 * casca do admin e a pública, por exemplo).
 */
export const CHANGELOG_BANNER_STORAGE_KEY = "sunano_changelog_banner_dismissed"

/**
 * Marca o <html> quando a versão atual já foi dispensada;
 * `html[data-changelog-dismissed] .changelog-banner` (globals.css) esconde o
 * aviso. Sem isto o aviso nascia escondido e aparecia depois da hidratação,
 * empurrando a página ~37px (CLS).
 */
export function changelogBannerProbeScript(version: string) {
  return `try{if(localStorage.getItem(${JSON.stringify(CHANGELOG_BANNER_STORAGE_KEY)})===${JSON.stringify(version)})document.documentElement.setAttribute("data-changelog-dismissed","")}catch(e){}`
}
