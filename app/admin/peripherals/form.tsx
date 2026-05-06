"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Upload } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLocale } from "@/lib/locale-context"
import { supabase } from "@/lib/supabase"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset"
type Tier = "T0" | "T0.5" | "T1" | "T2"
type Tag = "competitive" | "versatile" | "value" | "comfort"

const optionalNumber = z.preprocess((value) => {
  if (value === "" || value === null || typeof value === "undefined") return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}, z.number().min(0).max(6).optional())

const peripheralSchema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().min(1, "Brand is required"),
  category: z.enum(["keyboard", "mouse", "mousepad", "glasspad", "iem", "headset"]),
  tier: z.enum(["T0", "T0.5", "T1", "T2"]),
  price: z.number().positive("Price must be greater than 0"),
  rankLabel: z.string().optional(),
  priceRange: z.string().optional(),
  reviewUrl: z.string().optional(),
  reviewNote: z.string().optional(),
  guideUrl: z.string().optional(),
  notesLong: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.string().optional(),
  pros: z.string().optional(),
  cons: z.string().optional(),
  gallery: z.string().optional(),
  buyLinks: z.string().optional(),
  compatibility: z.string().optional(),
  notes: z.string().optional(),
  comparisons: z.string().optional(),
  weight: z.string().optional(),
  latency: z.string().optional(),
  switchType: z.string().optional(),
  coating: z.string().optional(),
  shape: z.string().optional(),
  gripSmall: z.string().optional(),
  gripMedium: z.string().optional(),
  gripLarge: z.string().optional(),
  ratingOverall: optionalNumber,
  ratingBuild: optionalNumber,
  ratingSoftware: optionalNumber,
  ratingBattery: optionalNumber,
  ratingPerformance: optionalNumber,
  ratingQc: optionalNumber,
  ratingValue: optionalNumber,
  mouseShape: z.string().optional(),
  keyboardLayout: z.string().optional(),
  connectivity: z.string().optional(),
  size: z.string().optional(),
  surface: z.string().optional(),
  driver: z.string().optional(),
  profile: z.string().optional(),
})

type PeripheralFormData = z.infer<typeof peripheralSchema>

const CATEGORIES = ["keyboard", "mouse", "mousepad", "glasspad", "iem", "headset"] as const
const TIERS = ["T0", "T0.5", "T1", "T2"] as const
const TAGS_OPTIONS = ["competitive", "versatile", "value", "comfort"] as const

interface PeripheralEditProps {
  peripheralId?: string
}

export const PeripheralForm: React.FC<PeripheralEditProps> = ({ peripheralId }) => {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  // Pré-selecionar todas as tags por padrão
  const [selectedTags, setSelectedTags] = useState<Tag[]>([
    "competitive",
    "versatile",
    "value",
    "comfort",
  ])
  const [error, setError] = useState<string | null>(null)
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null)
  const [originalUsdPrice, setOriginalUsdPrice] = useState<number | null>(null)

  const form = useForm<PeripheralFormData>({
    resolver: zodResolver(peripheralSchema),
    defaultValues: {
      name: "",
      brand: "",
      category: "mouse",
      tier: "T1",
      price: 0,
      rankLabel: "",
      priceRange: "",
      reviewUrl: "",
      reviewNote: "",
      guideUrl: "",
      notesLong: "",
      summary: "",
      highlights: "",
      pros: "",
      cons: "",
      gallery: "",
      buyLinks: "",
      compatibility: "",
      notes: "",
      comparisons: "",
      weight: "",
      latency: "",
      switchType: "",
      coating: "",
      shape: "",
      gripSmall: "",
      gripMedium: "",
      gripLarge: "",
      ratingOverall: undefined,
      ratingBuild: undefined,
      ratingSoftware: undefined,
      ratingBattery: undefined,
      ratingPerformance: undefined,
      ratingQc: undefined,
      ratingValue: undefined,
    },
  })

  useEffect(() => {
    if (peripheralId) {
      loadPeripheral()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peripheralId])

  useEffect(() => {
    // fetch exchange rate only when locale is pt-BR
    if (locale === "pt-BR") {
      fetchUsdToBrl()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  useEffect(() => {
    // if we loaded a peripheral and later got the rate, update displayed price
    if (usdToBrl && originalUsdPrice !== null && locale === "pt-BR") {
      form.setValue("price", Number((originalUsdPrice * usdToBrl).toFixed(2)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdToBrl, originalUsdPrice])

  async function fetchUsdToBrl() {
    try {
      const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=BRL")
      const json = await res.json()
      if (json && json.rates && json.rates.BRL) {
        setUsdToBrl(Number(json.rates.BRL))
      }
    } catch (err) {
      // ignore failures; fallback will be no conversion
      // console.error(err)
    }
  }

  async function loadPeripheral() {
    try {
      const { data, error: err } = await supabase
        .from("peripherals")
        .select("*")
        .eq("id", peripheralId)
        .single()

      if (err) throw err
      if (data) {
        // store original USD price and set displayed value according to locale
        setOriginalUsdPrice(data.price)
        const displayedPrice = locale === "pt-BR" && usdToBrl ? Number((data.price * usdToBrl).toFixed(2)) : data.price
        form.reset({
          name: data.name,
          brand: data.brand,
          category: data.category,
          tier: data.tier,
          price: displayedPrice,
          rankLabel: data.specs?.details?.rankLabel ?? "",
          priceRange: data.specs?.details?.priceRange ?? "",
          reviewUrl: data.specs?.details?.reviewUrl ?? "",
          reviewNote: data.specs?.details?.reviewNote ?? "",
          guideUrl: data.specs?.details?.guideUrl ?? "",
          notesLong: data.specs?.details?.notesLong ?? "",
          summary: data.specs?.details?.summary ?? "",
          highlights: Array.isArray(data.specs?.details?.highlights)
            ? data.specs.details.highlights.join("\n")
            : data.specs?.details?.highlights ?? "",
          pros: Array.isArray(data.specs?.details?.pros)
            ? data.specs.details.pros.join("\n")
            : data.specs?.details?.pros ?? "",
          cons: Array.isArray(data.specs?.details?.cons)
            ? data.specs.details.cons.join("\n")
            : data.specs?.details?.cons ?? "",
          gallery: Array.isArray(data.specs?.details?.gallery)
            ? data.specs.details.gallery.join("\n")
            : data.specs?.details?.gallery ?? "",
          buyLinks: Array.isArray(data.specs?.details?.buyLinks)
            ? data.specs.details.buyLinks.map((link: { label: string; url: string }) => `${link.label} | ${link.url}`).join("\n")
            : data.specs?.details?.buyLinks ?? "",
          compatibility: data.specs?.details?.compatibility ?? "",
          notes: data.specs?.details?.notes ?? "",
          comparisons: Array.isArray(data.specs?.details?.comparisons)
            ? data.specs.details.comparisons.join("\n")
            : data.specs?.details?.comparisons ?? "",
          weight: data.specs?.details?.weight ?? "",
          latency: data.specs?.details?.latency ?? "",
          switchType: data.specs?.details?.switchType ?? "",
          coating: data.specs?.details?.coating ?? "",
          shape: data.specs?.details?.shape ?? "",
          gripSmall: data.specs?.details?.gripSmall ?? "",
          gripMedium: data.specs?.details?.gripMedium ?? "",
          gripLarge: data.specs?.details?.gripLarge ?? "",
          ratingOverall: data.specs?.details?.ratings?.overall ?? undefined,
          ratingBuild: data.specs?.details?.ratings?.build ?? undefined,
          ratingSoftware: data.specs?.details?.ratings?.software ?? undefined,
          ratingBattery: data.specs?.details?.ratings?.battery ?? undefined,
          ratingPerformance: data.specs?.details?.ratings?.performance ?? undefined,
          ratingQc: data.specs?.details?.ratings?.qc ?? undefined,
          ratingValue: data.specs?.details?.ratings?.value ?? undefined,
          ...data.specs,
        })
        setSelectedTags(data.tags || [])
        if (data.image_url) {
          setImagePreview(data.image_url)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load peripheral" : "Erro ao carregar periférico"))
    }
  }

  async function onSubmit(data: PeripheralFormData): Promise<void> {
    try {
      setError(null)

      // Validar tags
      if (selectedTags.length === 0) {
        setError(isEnglish ? "Select at least one tag" : "Selecione pelo menos uma tag")
        return
      }

      let imageUrl = imagePreview

      if (imageFile) {
        setUploading(true)
        const fileName = `${Date.now()}-${imageFile.name}`
        const { error: uploadErr } = await supabase.storage
          .from("peripherals")
          .upload(fileName, imageFile)

        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage.from("peripherals").getPublicUrl(fileName)
        imageUrl = urlData.publicUrl
      }

      const splitLines = (value?: string) =>
        value
          ? value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
          : []

      const parseBuyLinks = (value?: string) =>
        splitLines(value).map((line) => {
          const [label, url] = line.split("|").map((part) => part.trim())
          return { label: url ? label || "Comprar" : "Comprar", url: url || label }
        })

      const ratings = {
        overall: data.ratingOverall,
        build: data.ratingBuild,
        software: data.ratingSoftware,
        battery: data.ratingBattery,
        performance: data.ratingPerformance,
        qc: data.ratingQc,
        value: data.ratingValue,
      }
      const cleanedRatings = Object.fromEntries(
        Object.entries(ratings).filter(([, value]) => typeof value === "number" && !Number.isNaN(value))
      )

      const specs = {
        mouseShape: data.mouseShape,
        keyboardLayout: data.keyboardLayout,
        connectivity: data.connectivity,
        size: data.size,
        surface: data.surface,
        driver: data.driver,
        profile: data.profile,
        details: {
          rankLabel: data.rankLabel || undefined,
          priceRange: data.priceRange || undefined,
          reviewUrl: data.reviewUrl || undefined,
          reviewNote: data.reviewNote || undefined,
          guideUrl: data.guideUrl || undefined,
          notesLong: data.notesLong || undefined,
          summary: data.summary || undefined,
          highlights: splitLines(data.highlights),
          pros: splitLines(data.pros),
          cons: splitLines(data.cons),
          gallery: splitLines(data.gallery),
          buyLinks: parseBuyLinks(data.buyLinks),
          compatibility: data.compatibility || undefined,
          notes: data.notes || undefined,
          comparisons: splitLines(data.comparisons),
          weight: data.weight || undefined,
          latency: data.latency || undefined,
          switchType: data.switchType || undefined,
          coating: data.coating || undefined,
          shape: data.shape || undefined,
          gripSmall: data.gripSmall || undefined,
          gripMedium: data.gripMedium || undefined,
          gripLarge: data.gripLarge || undefined,
          ratings: Object.keys(cleanedRatings).length > 0 ? cleanedRatings : undefined,
        },
      }

      // Convert price to USD before saving (store prices in USD)
      let priceToSave = data.price
      if (locale === "pt-BR") {
        // convert BRL -> USD: USD = BRL / (USD->BRL)
        let rate = usdToBrl
        if (!rate) {
          // try fetching a fresh rate
          try {
            const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=BRL")
            const json = await res.json()
            rate = json?.rates?.BRL ? Number(json.rates.BRL) : null
          } catch (e) {
            rate = null
          }
        }
        if (rate && rate > 0) {
          priceToSave = Number((data.price / rate).toFixed(2))
        }
      }

      const peripheralData = {
        name: data.name,
        brand: data.brand,
        category: data.category,
        tier: data.tier,
        price: priceToSave,
        image_url: imageUrl,
        tags: selectedTags,
        specs,
      }

      if (peripheralId) {
        const { error: err } = await supabase
          .from("peripherals")
          .update(peripheralData)
          .eq("id", peripheralId)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from("peripherals").insert([peripheralData])
        if (err) throw err
      }

      router.push("/admin/peripherals")
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to save" : "Erro ao salvar"))
    } finally {
      setUploading(false)
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const toggleTag = (tag: Tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div className="space-y-8">
      <Link href="/admin/peripherals">
        <Button className="gap-2" variant="ghost">
          <ChevronLeft className="size-4" />
          {isEnglish ? "Back" : "Voltar"}
        </Button>
      </Link>

      <Card className="mt-4 border-border bg-card/90">
        <CardHeader className="border-b border-border">
          <CardTitle>{peripheralId ? (isEnglish ? "Edit Peripheral" : "Editar Periférico") : (isEnglish ? "New Peripheral" : "Novo Periférico")}</CardTitle>
          <CardDescription>
            {peripheralId ? (isEnglish ? "Edit peripheral information" : "Edite as informações do periférico") : (isEnglish ? "Create a new peripheral" : "Crie um novo periférico")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {error && <div className="bg-red-500/15 border border-red-500/30 text-red-300 p-3 rounded mb-4">{error}</div>}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Imagem */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">{isEnglish ? "Image" : "Imagem"}</label>
              <div className="flex gap-4 items-start">
                {imagePreview && (
                  <div className="relative w-32 h-32 rounded-lg border border-border overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="Preview" className="w-full h-full object-cover" src={imagePreview} />
                  </div>
                )}
                <label className="flex-1 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary/40 transition">
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                    type="file"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="size-6 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">{isEnglish ? "Click to upload or drag the image" : "Clique para enviar ou arraste a imagem"}</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Informações Básicas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{isEnglish ? "Name" : "Nome"}</label>
                <Input
                  className="border-border bg-card/50"
                  placeholder="Ex: Logitech G Pro X Superlight 2"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="text-red-400 text-xs">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{isEnglish ? "Brand" : "Marca"}</label>
                <Input
                  className="border-border bg-card/50"
                  placeholder="Ex: Logitech"
                  {...form.register("brand")}
                />
                {form.formState.errors.brand && (
                  <p className="text-red-400 text-xs">{form.formState.errors.brand.message}</p>
                )}
              </div>

              <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">{isEnglish ? "Price ($)" : "Preço (R$)"}</label>
                <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "159" : "159"}
                  type="number"
                  step="0.01"
                  {...form.register("price", { valueAsNumber: true })}
                />
                {form.formState.errors.price && (
                  <p className="text-red-400 text-xs">{form.formState.errors.price.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{isEnglish ? "Category" : "Categoria"}</label>
                <Select
                  onValueChange={(value) => form.setValue("category", value as Category)}
                  value={form.watch("category")}
                >
                  <SelectTrigger className="border-border bg-card/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Tier</label>
                <Select
                  onValueChange={(value) => form.setValue("tier", value as Tier)}
                  value={form.watch("tier")}
                >
                  <SelectTrigger className="border-border bg-card/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>
                        {tier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">{isEnglish ? "Tags" : "Tags"}</label>
              <div className="flex gap-2 flex-wrap">
                {TAGS_OPTIONS.map((tag) => (
                  <Badge
                    key={tag}
                    className={`cursor-pointer transition ${
                      selectedTags.includes(tag)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                    }`}
                    onClick={() => toggleTag(tag)}
                    variant="secondary"
                  >
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </Badge>
                ))}
              </div>
              {selectedTags.length === 0 && (
                <p className="text-red-400 text-xs">{isEnglish ? "At least one tag selection is required" : "Seleção de pelo menos uma tag é obrigatória"}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {isEnglish ? "Selected" : "Selecionadas"}: {selectedTags.length} {isEnglish ? "of" : "de"} {TAGS_OPTIONS.length}
              </p>
            </div>

            {/* Specs Específicas por Categoria */}
            <div className="space-y-4 border-t border-border pt-6">
              <h3 className="font-semibold text-foreground">{isEnglish ? "Specifications" : "Especificações"}</h3>

              {form.watch("category") === "mouse" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Mouse Shape</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="symmetrical, ergonomic"
                      {...form.register("mouseShape")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Driver</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="HERO 2, PMW 3389"
                      {...form.register("driver")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Connectivity</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="wired, wireless"
                      {...form.register("connectivity")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Size</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="small, medium, large"
                      {...form.register("size")}
                    />
                  </div>
                </div>
              )}

              {form.watch("category") === "keyboard" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Layout</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="60%, 75%, TKL, Full-size"
                      {...form.register("keyboardLayout")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Profile</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="Rapid Trigger, Hall Effect"
                      {...form.register("profile")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Connectivity</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="wired, wireless"
                      {...form.register("connectivity")}
                    />
                  </div>
                </div>
              )}

              {form.watch("category") === "mousepad" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Surface</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="cloth, hybrid, glass"
                      {...form.register("surface")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Profile</label>
                    <Input
                      className="border-border bg-card/50"
                      placeholder="Control, Speed"
                      {...form.register("profile")}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Conteudo da Wiki */}
            <div className="space-y-4 border-t border-border pt-6">
              <h3 className="font-semibold text-foreground">{isEnglish ? "Wiki content" : "Conteudo da wiki"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Summary" : "Resumo"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Short summary" : "Resumo curto"}
                    {...form.register("summary")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Compatibility" : "Compatibilidade"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Windows, macOS, PS5" : "Windows, macOS, PS5"}
                    {...form.register("compatibility")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Rank label" : "Rank"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "GOAT, S, A" : "GOAT, S, A"}
                    {...form.register("rankLabel")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Price range" : "Faixa de preco"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "R$1050-1130" : "R$1050-1130"}
                    {...form.register("priceRange")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Review URL" : "Review URL"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder="https://youtube.com/..."
                    {...form.register("reviewUrl")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Guide URL" : "Guia URL"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder="https://..."
                    {...form.register("guideUrl")}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Review note" : "Nota do review"}</label>
                <Textarea
                  className="border-border bg-card/50"
                  placeholder={isEnglish ? "Short note about the review" : "Nota curta sobre o review"}
                  rows={2}
                  {...form.register("reviewNote")}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Weight" : "Peso"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "61g" : "61g"}
                    {...form.register("weight")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Latency" : "Latencia"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "0.62 ms" : "0.62 ms"}
                    {...form.register("latency")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Switch" : "Switch"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Magnetic" : "Magnetico"}
                    {...form.register("switchType")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Shape" : "Shape"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Symmetrical" : "Simetrico"}
                    {...form.register("shape")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Coating" : "Coating"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Plastic" : "Plastico"}
                    {...form.register("coating")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Grip (small hand)" : "Pegada (mao pequena)"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Claw/Palm" : "Claw/Palm"}
                    {...form.register("gripSmall")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Grip (medium hand)" : "Pegada (mao media)"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Claw/Palm" : "Claw/Palm"}
                    {...form.register("gripMedium")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Grip (large hand)" : "Pegada (mao grande)"}</label>
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Claw/Finger" : "Claw/Finger"}
                    {...form.register("gripLarge")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Ratings (0-6)" : "Notas (0-6)"}</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Overall" : "Geral"}
                    type="number"
                    step="1"
                    min="0"
                    max="6"
                    {...form.register("ratingOverall")}
                  />
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Build" : "Construcao"}
                    type="number"
                    step="1"
                    min="0"
                    max="6"
                    {...form.register("ratingBuild")}
                  />
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Software" : "Software"}
                    type="number"
                    step="1"
                    min="0"
                    max="6"
                    {...form.register("ratingSoftware")}
                  />
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Battery" : "Bateria"}
                    type="number"
                    step="1"
                    min="0"
                    max="6"
                    {...form.register("ratingBattery")}
                  />
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Performance" : "Performance"}
                    type="number"
                    step="1"
                    min="0"
                    max="6"
                    {...form.register("ratingPerformance")}
                  />
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "QC" : "QC"}
                    type="number"
                    step="1"
                    min="0"
                    max="6"
                    {...form.register("ratingQc")}
                  />
                  <Input
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "Value" : "CxB"}
                    type="number"
                    step="1"
                    min="0"
                    max="6"
                    {...form.register("ratingValue")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Highlights" : "Destaques"}</label>
                  <Textarea
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "One per line" : "Um por linha"}
                    rows={4}
                    {...form.register("highlights")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Comparisons" : "Comparacoes"}</label>
                  <Textarea
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "One per line" : "Um por linha"}
                    rows={4}
                    {...form.register("comparisons")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Pros</label>
                  <Textarea
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "One per line" : "Um por linha"}
                    rows={4}
                    {...form.register("pros")}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Cons</label>
                  <Textarea
                    className="border-border bg-card/50"
                    placeholder={isEnglish ? "One per line" : "Um por linha"}
                    rows={4}
                    {...form.register("cons")}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Gallery URLs" : "URLs da galeria"}</label>
                <Textarea
                  className="border-border bg-card/50"
                  placeholder={isEnglish ? "One image URL per line" : "Uma URL por linha"}
                  rows={4}
                  {...form.register("gallery")}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Buy links" : "Links de compra"}</label>
                <Textarea
                  className="border-border bg-card/50"
                  placeholder={isEnglish ? "Label | https://... (one per line)" : "Label | https://... (uma por linha)"}
                  rows={4}
                  {...form.register("buyLinks")}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Notes (large)" : "Notas (grande)"}</label>
                <Textarea
                  className="border-border bg-card/50"
                  placeholder={isEnglish ? "Main notes and context" : "Notas principais e contexto"}
                  rows={6}
                  {...form.register("notesLong")}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{isEnglish ? "Notes" : "Notas"}</label>
                <Textarea
                  className="border-border bg-card/50"
                  placeholder={isEnglish ? "Extra notes" : "Observacoes extras"}
                  rows={3}
                  {...form.register("notes")}
                />
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3 justify-end border-t border-border pt-6">
              <Link href="/admin/peripherals">
                <Button variant="outline">{isEnglish ? "Cancel" : "Cancelar"}</Button>
              </Link>
              <Button disabled={uploading || form.formState.isSubmitting} type="submit">
                {uploading || form.formState.isSubmitting ? (isEnglish ? "Saving..." : "Salvando...") : (isEnglish ? "Save" : "Salvar")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
