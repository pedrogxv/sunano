import "server-only"

import { signSupportImageUrls } from "@/lib/server/support-media"
import type { OrderServiceFormAnswers } from "@/lib/store-service-form"

/**
 * Troca as fotos gravadas por URLs assinadas de curta duração, na leitura
 * (Meus Pedidos e fila do admin). O bucket `support` é privado; nunca grava
 * de volta. Uma assinatura por foto, só das respostas que têm foto.
 */
export async function signServiceFormAnswerImages(
  answers: OrderServiceFormAnswers | null
): Promise<OrderServiceFormAnswers | null> {
  if (!answers) return answers
  const hasImages = answers.lines.some((line) =>
    line.answers.some((answer) => answer.type === "image" && Array.isArray(answer.items) && answer.items.length > 0)
  )
  if (!hasImages) return answers
  return {
    ...answers,
    lines: await Promise.all(
      answers.lines.map(async (line) => ({
        ...line,
        answers: await Promise.all(
          line.answers.map(async (answer) =>
            answer.type === "image" && Array.isArray(answer.items)
              ? { ...answer, items: await signSupportImageUrls(answer.items) }
              : answer
          )
        ),
      }))
    ),
  }
}
