import { redirect } from "next/navigation"

export default function BazarPage() {
  redirect("/loja?type=bazaar")
}
