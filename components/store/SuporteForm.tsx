"use client"

import { useState, type FormEvent } from "react"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const SUPPORT_EMAIL = "contato@sunano.gg"

/** Ainda não existe um sistema de ticket — o formulário só monta um e-mail
 *  pronto pro cliente de e-mail padrão do usuário abrir. Sem backend por trás. */
export function SuporteForm() {
  const [name, setName] = useState("")
  const [orderNumber, setOrderNumber] = useState("")
  const [message, setMessage] = useState("")

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const subject = orderNumber.trim() ? `Suporte Sunano — Pedido #${orderNumber.trim()}` : "Suporte Sunano"
    const body = [
      name.trim() ? `Nome: ${name.trim()}` : null,
      orderNumber.trim() ? `Pedido: #${orderNumber.trim()}` : null,
      "",
      message.trim(),
    ]
      .filter((line): line is string => line !== null)
      .join("\n")

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="suporte-nome">Nome</Label>
        <Input id="suporte-nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="suporte-pedido">Número do pedido (opcional)</Label>
        <Input
          id="suporte-pedido"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="Ex: 1234"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="suporte-mensagem">Mensagem</Label>
        <Textarea
          id="suporte-mensagem"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Descreve o que está acontecendo..."
          className="min-h-32"
          required
        />
      </div>

      <Button type="submit" className="gap-2 self-start">
        <Mail className="size-4" />
        Enviar por e-mail
      </Button>
    </form>
  )
}
