import Link from "next/link"
import { XCircle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CheckoutCancelPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-slate-500/15">
        <XCircle className="size-10 text-slate-400" />
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-black text-slate-50">Pagamento cancelado</h1>
        <p className="text-slate-400 max-w-sm">
          Você cancelou o processo de pagamento. Seu carrinho foi mantido.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/loja">
          <Button className="gap-2">
            <ArrowLeft className="size-4" />
            Voltar à loja
          </Button>
        </Link>
        <Link href="/bazar">
          <Button variant="outline" className="gap-2">
            Ir ao Bazar
          </Button>
        </Link>
      </div>
    </div>
  )
}
