/**
 * Permissão de sensor de movimento (iOS 13+).
 *
 * O iOS só entrega `deviceorientation` depois de um `requestPermission()`
 * disparado DENTRO de um gesto do usuário — não existe jeito de conceder
 * silenciosamente. Android e desktop não têm esse porteiro.
 *
 * Este módulo existe separado do `useHoloTilt` porque quem dispara o pedido
 * não é o card: é o banner de cookies (ver `CookieBanner`), juntando os dois
 * consentimentos no mesmo toque em vez de abrir o aviso do sistema no meio da
 * navegação. O card só escuta o resultado.
 */

const STORAGE_KEY = "sunano_motion_permission"

interface DeviceOrientationEventiOS {
  // Não é `"granted" | "denied"`: o Chrome também expõe esta API e responde
  // `"prompt"` (= "ainda perguntaria"), que não é decisão nenhuma.
  requestPermission?: () => Promise<string>
}

type Outcome = "granted" | "denied"

/** Avisados quando a permissão é concedida, para religarem seus listeners. */
const subscribers = new Set<() => void>()

/**
 * Ligado assim que uma leitura de verdade chega. Onde o sensor já entrega
 * dados sozinho (Android), pedir permissão só serviria para mostrar um aviso
 * à toa — então o pedido vira último recurso, não o primeiro passo.
 */
let alreadyReceiving = false

export function reportMotionReadingReceived() {
  alreadyReceiving = true
}

function iosApi(): DeviceOrientationEventiOS | null {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return null
  const api = window.DeviceOrientationEvent as unknown as DeviceOrientationEventiOS
  return typeof api.requestPermission === "function" ? api : null
}

function readStored(): Outcome | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "granted" || stored === "denied" ? stored : null
  } catch {
    return null
  }
}

function store(outcome: Outcome) {
  try {
    localStorage.setItem(STORAGE_KEY, outcome)
  } catch {
    // localStorage pode estar indisponível (navegação privada, site data bloqueado)
  }
}

/**
 * - `not-needed`: navegador sem porteiro (Android/desktop) — é só ouvir.
 * - `granted` / `denied`: já resolvido numa visita anterior.
 * - `undecided`: precisa de um gesto do usuário para perguntar.
 */
export function motionPermissionState(): "not-needed" | "granted" | "denied" | "undecided" {
  if (!iosApi()) return "not-needed"
  return readStored() ?? "undecided"
}

/**
 * Pede (ou revalida) a permissão. Precisa ser chamada de dentro de um handler
 * de gesto na primeira vez; quem já concedeu antes resolve na hora e sem aviso
 * nenhum na tela, então a volta ao site é silenciosa.
 *
 * Devolve `false` sem nem chamar a API quando o usuário já negou: reabrir o
 * aviso do sistema a cada visita depois de um "não" é justamente o que faz
 * esse tipo de efeito parecer insistente.
 */
export async function requestMotionPermission(): Promise<boolean> {
  const api = iosApi()
  if (!api) return true
  if (alreadyReceiving) return true
  if (readStored() === "denied") return false

  try {
    const result = await api.requestPermission!()
    // Só grava decisão de verdade: `"prompt"` do Chrome significa que nada foi
    // decidido, e guardar isso travaria a pergunta seguinte.
    if (result === "granted" || result === "denied") store(result)
    if (result === "granted") {
      for (const notify of subscribers) notify()
      return true
    }
    return false
  } catch {
    // Gesto que não contou como ativação do usuário: NÃO grava nada, para a
    // próxima tentativa ainda poder abrir o aviso.
    return false
  }
}

/** Avisa quando a permissão for concedida. Devolve o cancelamento. */
export function subscribeMotionPermission(onGranted: () => void): () => void {
  subscribers.add(onGranted)
  return () => {
    subscribers.delete(onGranted)
  }
}
