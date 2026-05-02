import Link from "next/link";
import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-4 md:auto-rows-[18rem] md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
  href,
  ctaLabel = "Ler artigo",
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  ctaLabel?: string;
}) => {
  const content = (
    <div
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-4 rounded-2xl border border-border bg-card p-4 text-foreground shadow-[0_16px_40px_rgba(0,0,0,0.18)] transition duration-200 hover:border-primary/20 hover:shadow-[0_20px_60px_rgba(0,0,0,0.28)]",
        href ? "cursor-pointer" : "",
        className,
      )}
    >
      {header}
      <div className="transition duration-200 group-hover/bento:translate-x-2">
        {icon}
        <div className="mt-2 mb-2 font-sans font-bold text-foreground">
          {title}
        </div>
        <div className="font-sans text-xs font-normal text-muted-foreground">
          {description}
        </div>
        <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
          {ctaLabel}
          <span className="transition-transform duration-200 group-hover/bento:translate-x-0.5">
            →
          </span>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block" style={{height: "fit-content"}}>
        {content}
      </Link>
    );
  }

  return content;
};
