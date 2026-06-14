"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/lib/use-t"

interface Offer {
  id: string
  name: string
  image_url: string | null
  value: number
  currency: string
  currency_symbol: string
  coupon_code: string | null
  link: string
  status: "active" | "cancelled" | "expired"
  expires_at: string | null
  created_at: string
  updated_at: string
  peripheral_id?: string | null
}

interface PeripheralOption {
  id: string
  name: string
  brand: string
}

const NO_PERIPHERAL_VALUE = "__no_peripheral__"

interface OfferFormProps {
  offer?: Offer
  onSuccess: () => void
  onCancel: () => void
}

export function OfferForm({ offer, onSuccess, onCancel }: OfferFormProps) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peripherals, setPeripherals] = useState<PeripheralOption[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(offer?.image_url || null)
  const [formData, setFormData] = useState({
    name: offer?.name || "",
    value: offer?.value?.toString() || "",
    currency: offer?.currency || "BRL",
    currency_symbol: offer?.currency_symbol || "R$",
    coupon_code: offer?.coupon_code || "",
    link: offer?.link || "",
    expires_at: offer?.expires_at ? offer.expires_at.split("T")[0] : "",
    peripheral_id: offer?.peripheral_id || "",
  })

  useEffect(() => {
    loadPeripherals()
  }, [])

  async function loadPeripherals() {
    try {
      const res = await fetch("/api/peripherals?limit=1000", { cache: "no-store" })
      const data = (await res.json().catch(() => null)) as { peripherals?: PeripheralOption[]; error?: string } | null
      if (!res.ok || !data?.peripherals) {
        throw new Error(data?.error ?? t.admin.blog.form.failedToLoadPeripheralsOffer)
      }
      setPeripherals(data.peripherals)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.blog.form.failedToLoadPeripheralsOffer)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      let imageUrl = imagePreview

      if (imageFile) {
        setUploading(true)
        const uploadFormData = new FormData()
        uploadFormData.set("file", imageFile)

        const uploadResponse = await fetch("/api/admin/offers/upload-image", {
          method: "POST",
          body: uploadFormData,
        })

        const uploadData = (await uploadResponse.json()) as { ok?: boolean; error?: string; publicUrl?: string }

        if (!uploadResponse.ok || !uploadData.ok || !uploadData.publicUrl) {
          throw new Error(uploadData.error ?? t.admin.blog.form.failedToUploadOfferImage)
        }

        imageUrl = uploadData.publicUrl
      }

      const url = offer ? `/api/admin/offers/${offer.id}` : "/api/admin/offers"
      const method = offer ? "PATCH" : "POST"

      const payload = {
        name: formData.name,
        image_url: imageUrl,
        value: parseFloat(formData.value),
        currency: formData.currency,
        currency_symbol: formData.currency_symbol,
        coupon_code: formData.coupon_code || null,
        link: formData.link,
        peripheral_id: formData.peripheral_id || null,
        expires_at: formData.expires_at
          ? new Date(formData.expires_at).toISOString()
          : null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? t.admin.blog.form.failedToSaveOffer)
      }

      toast.success(
        offer ? t.admin.blog.form.offerUpdated : t.admin.blog.form.offerCreated,
        { description: formData.name }
      )

      onSuccess()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.blog.form.failedToSaveOffer
      setError(message)
      toast.error(t.admin.blog.form.failedToSaveOffer, { description: message })
    } finally {
      setUploading(false)
      setLoading(false)
    }
  }

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <Alert variant="destructive" className="py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5" />
          <AlertDescription className="text-xs leading-5">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-semibold">{t.admin.blog.form.offerImage}</Label>
        <div className="flex items-start gap-4">
          {imagePreview && (
            <div className="h-28 w-40 overflow-hidden rounded-lg border border-border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={t.admin.blog.form.offerPreview} className="h-full w-full object-cover" src={imagePreview} />
            </div>
          )}
          <label className="flex-1 cursor-pointer rounded-lg border-2 border-dashed border-border p-5 transition hover:border-primary/40">
            <input accept="image/*" className="hidden" onChange={handleImageSelect} type="file" />
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t.admin.blog.form.clickToUploadOffer}</p>
            </div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">
            {t.admin.blog.form.offerName} <span className="text-red-400">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder='Ex: Monitor Gamer 27"'
            required
            minLength={2}
            maxLength={200}
          />
          <p className="text-[10px] text-muted-foreground/60">
            {t.admin.blog.form.offerNameMin}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="link">
            {t.admin.blog.form.offerLink} <span className="text-red-400">*</span>
          </Label>
          <Input
            id="link"
            type="url"
            value={formData.link}
            onChange={(e) => setFormData({ ...formData, link: e.target.value })}
            placeholder="https://..."
            required
          />
          <p className="text-[10px] text-muted-foreground/60">
            {t.admin.blog.form.offerLinkFull}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="value">
            {t.admin.blog.form.price} <span className="text-red-400">*</span>
          </Label>
          <Input
            id="value"
            type="number"
            step="0.01"
            min={0.01}
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
            placeholder="0.00"
            required
          />
          <p className="text-[10px] text-muted-foreground/60">
            {t.admin.blog.form.priceGtZero}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">{t.admin.blog.form.currency}</Label>
          <Input
            id="currency"
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            placeholder="BRL"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency_symbol">{t.admin.blog.form.symbol}</Label>
          <Input
            id="currency_symbol"
            value={formData.currency_symbol}
            onChange={(e) =>
              setFormData({ ...formData, currency_symbol: e.target.value })
            }
            placeholder="R$"
            maxLength={3}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t.admin.blog.form.linkedPeripheral}</Label>
          <Select
            value={formData.peripheral_id || NO_PERIPHERAL_VALUE}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                peripheral_id: value === NO_PERIPHERAL_VALUE ? "" : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t.admin.blog.form.selectPeripheral} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PERIPHERAL_VALUE}>{t.admin.blog.form.noLinkedPeripheral}</SelectItem>
              {peripherals.map((peripheral) => (
                <SelectItem key={peripheral.id} value={peripheral.id}>
                  {peripheral.brand} - {peripheral.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="coupon_code">{t.admin.blog.form.couponCode}</Label>
          <Input
            id="coupon_code"
            value={formData.coupon_code}
            onChange={(e) => setFormData({ ...formData, coupon_code: e.target.value })}
            placeholder="Ex: DESCONTO20"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="expires_at">{t.admin.blog.form.expirationDate}</Label>
          <Input
            id="expires_at"
            type="date"
            value={formData.expires_at}
            onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading || uploading}
        >
          {t.admin.blog.form.cancel}
        </Button>
        <Button type="submit" disabled={loading || uploading}>
          {(loading || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {offer ? t.admin.blog.form.update : t.admin.blog.form.create} {t.admin.blog.form.offer}
        </Button>
      </div>
    </form>
  )
}
