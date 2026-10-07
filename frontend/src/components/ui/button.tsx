import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Botões do CogniVault. Base do shadcn/ui, ajustada ao briefing
 * (docs/redesign-2026-10/briefing.md): texto de 16 px, alvo de clique de 40 px para
 * mouse, e UM só visual para cada papel.
 *
 *  default  — a ação principal da tela (laranja). Uma por tela.
 *  add      — "adicionar ao orçamento", a ação mais repetida do balcão.
 *  added    — a mesma peça, já no orçamento.
 *  outline  — ação secundária.
 *  ghost    — ação discreta (copiar, fechar).
 *  bar      — sobre a barra azul superior.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding text-base font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        add: "border-[1.5px] border-add bg-transparent text-add hover:bg-add/10",
        added: "border-[1.5px] border-ok bg-ok-soft text-ok hover:bg-ok-soft",
        outline: "border-input bg-card text-foreground hover:bg-accent aria-expanded:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        bar: "border-white/20 bg-white/10 text-bar-foreground hover:bg-white/20 aria-expanded:bg-white/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-6 text-lg",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      // Sem `type`, o navegador trata <button> como "submit": dentro de um formulário (a busca),
      // "+ Orçamento" refaria a pesquisa. Link (asChild) não leva `type`.
      {...(asChild ? {} : { type: type ?? 'button' })}
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
