"use client"

import * as React from "react"
import { SmilePlus, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { VARIANT_EMOJI_LIST, VARIANT_EMOJI_GROUPS, VARIANT_EMOJI_SUGGESTIONS } from "@/lib/variant-icons"

interface EmojiPickerProps {
  value: string | null
  onChange: (emoji: string | null) => void
  className?: string
  triggerClassName?: string
  "aria-label"?: string
}

const emojiByGroup = VARIANT_EMOJI_GROUPS.map((group) => ({
  group,
  emojis: VARIANT_EMOJI_LIST.filter((e) => e.group === group),
}))

/**
 * Seletor de emoji estilo shadcn Select (trigger compacto + popover), com
 * busca via Command/cmdk sobre o dataset unicode-emoji-json — sem depender
 * do web component emoji-picker-element, que não se integra bem com SSR.
 */
export function EmojiPicker({ value, onChange, className, triggerClassName, ...aria }: EmojiPickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={aria["aria-label"] ?? "Selecionar emoji"}
          className={cn(
            "flex h-8 w-16 shrink-0 items-center justify-center gap-1 rounded-lg border border-input bg-transparent text-base transition-colors outline-none select-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
            className
          )}
        >
          {value ? (
            <span className="text-base leading-none">{value}</span>
          ) : (
            <SmilePlus className="size-4 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-72 p-0", triggerClassName)} align="start">
        <Command
          loop
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Buscar emoji..." />
          <div className="flex flex-wrap gap-1 border-b border-border/60 p-2">
            {VARIANT_EMOJI_SUGGESTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onChange(emoji)
                  setOpen(false)
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-muted",
                  value === emoji && "bg-emerald-500/10 ring-1 ring-emerald-500"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <CommandList className="max-h-56">
            <CommandEmpty>Nenhum emoji encontrado.</CommandEmpty>
            {emojiByGroup.map(({ group, emojis }) => (
              <CommandGroup key={group} heading={group}>
                <div className="flex flex-wrap gap-1 px-1 pb-1">
                  {emojis.map(({ emoji, name }) => (
                    <CommandItem
                      key={emoji}
                      value={`${emoji} ${name}`}
                      onSelect={() => {
                        onChange(emoji)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center gap-0 rounded-md p-0 text-base leading-none data-[selected=true]:bg-muted [&_svg]:hidden",
                        value === emoji && "bg-emerald-500/10 ring-1 ring-emerald-500"
                      )}
                      title={name}
                    >
                      {emoji}
                    </CommandItem>
                  ))}
                </div>
              </CommandGroup>
            ))}
          </CommandList>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="flex items-center justify-center gap-1.5 border-t border-border/60 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-red-400"
            >
              <X className="size-3" />
              Remover emoji
            </button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
