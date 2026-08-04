import type { ElementType } from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ChangelogColor = "emerald" | "violet" | "amber" | "cyan";

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  description: string;
  items?: string[];
  icon?: ElementType;
  color?: ChangelogColor;
};

export interface Changelog1Props {
  title?: string;
  description?: string;
  entries?: ChangelogEntry[];
  className?: string;
}

const COLOR_STYLES: Record<ChangelogColor, { dot: string; badge: string }> = {
  emerald: {
    dot: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  violet: {
    dot: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    badge: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
  amber: {
    dot: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  cyan: {
    dot: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
    badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  },
};

export const Changelog1 = ({
  title = "Changelog",
  description = "Get the latest updates and improvements to our platform.",
  entries = [],
}: Changelog1Props) => {
  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="size-3.5" />
            Changelog
          </p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mb-6 text-base text-muted-foreground md:text-lg">
            {description}
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-3xl md:mt-20">
          {/* Linha da timeline — só no desktop, onde o marcador fica ao lado do texto */}
          <div className="absolute top-2 bottom-2 left-[7px] hidden w-px bg-border md:block" />

          <div className="space-y-12 md:space-y-16">
            {entries.map((entry, index) => {
              const styles = COLOR_STYLES[entry.color ?? "cyan"];
              const Icon = entry.icon;
              return (
                <div key={`${entry.version}-${entry.date}`} className="relative flex flex-col gap-4 md:flex-row md:gap-10">
                  <span
                    className={cn(
                      "relative z-10 hidden size-4 shrink-0 rounded-full ring-4 ring-background md:absolute md:top-1 md:left-0 md:block",
                      index === 0 ? "bg-primary" : "bg-muted-foreground/40"
                    )}
                  />

                  <div className="flex flex-col md:pl-10">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("text-xs font-semibold", styles.badge)}>
                        {entry.version}
                      </Badge>
                      <span className="text-xs font-medium text-muted-foreground">{entry.date}</span>
                      {index === 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                          Mais recente
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-3">
                      {Icon && (
                        <div
                          className={cn(
                            "hidden size-9 shrink-0 items-center justify-center rounded-xl ring-1 sm:flex",
                            styles.dot
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="text-lg leading-tight font-bold text-foreground md:text-2xl">
                          {entry.title}
                        </h2>
                        <p className="mt-1.5 text-sm text-muted-foreground md:text-base">
                          {entry.description}
                        </p>
                      </div>
                    </div>

                    {entry.items && entry.items.length > 0 && (
                      <ul className="mt-4 space-y-1.5 sm:pl-12">
                        {entry.items.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground md:text-base">
                            <span className={cn("mt-2 size-1 shrink-0 rounded-full", styles.dot.split(" ")[0])} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
