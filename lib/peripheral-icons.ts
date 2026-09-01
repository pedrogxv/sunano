import {
  Mouse,
  Zap,
  Keyboard,
  Headphones,
  Monitor,
  Square,
  Mic,
  Webcam,
  Gamepad2,
  Volume2,
  Cable,
} from "lucide-react"

const PERIPHERAL_KEYWORDS: Record<string, typeof Mouse> = {
  // Mouse variants
  mouse: Mouse,
  rato: Mouse,
  
  // Keyboard variants
  keyboard: Keyboard,
  teclado: Keyboard,
  mecânico: Keyboard,
  mecanico: Keyboard,
  
  // Headset/Headphone variants
  headset: Headphones,
  headphone: Headphones,
  fone: Headphones,
  headphones: Headphones,
  auricular: Headphones,
  
  // Monitor variants
  monitor: Monitor,
  display: Monitor,
  
  // Mousepad variants
  mousepad: Square,
  pad: Square,
  tapete: Square,
  
  // Microphone variants
  microphone: Mic,
  microfone: Mic,
  
  // Webcam variants
  webcam: Webcam,
  câmera: Webcam,
  camera: Webcam,
  
  // Controller/Gamepad variants
  gamepad: Gamepad2,
  controller: Gamepad2,
  controle: Gamepad2,
  
  // Speaker/Audio variants
  speaker: Volume2,
  alto_falante: Volume2,
  
  // Cable/Adapter variants
  cable: Cable,
  adapter: Cable,
  hub: Cable,
  
  // Mouse Feet variants
  feet: Square,
  foot: Square,
  pés: Square,
  
  // Chairs variants
  chairs: Square,
  cadeira: Square,
  chair: Square,
  
  // Switches variants
  switches: Keyboard,
  switch: Keyboard,
  
  // PSU / Fontes variants
  psu: Zap,
  fonte: Zap,
  fontes: Zap,

  // DAC/AMP variants
  dac: Volume2,
  amp: Volume2,
  amplifier: Volume2,
  amplificador: Volume2,
}

export function getPeripheralIcon(peripheralName: string | null | undefined): typeof Mouse | null {
  if (!peripheralName) return null
  
  const normalized = peripheralName.toLowerCase().trim()
  
  // Try exact match first
  if (PERIPHERAL_KEYWORDS[normalized]) {
    return PERIPHERAL_KEYWORDS[normalized]
  }
  
  // Try partial match
  for (const [keyword, icon] of Object.entries(PERIPHERAL_KEYWORDS)) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      return icon
    }
  }
  
  // Default fallback (no icon)
  return null
}
