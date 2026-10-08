import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Tabela do CogniVault: UMA só para todas as listas (Usuários, Registro de ações, Negócio, Catálogos…).
 * Cabeçalho em faixa, linha com divisor e destaque ao passar o mouse, número sempre em algarismos tabulares.
 * A moldura (borda e canto) é da tabela, para a lista ter o mesmo contorno em toda tela.
 */
function Table({ className, containerClassName, ...props }: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div data-slot="table-container" className={cn("w-full overflow-x-auto rounded-xl border border-border bg-card", containerClassName)}>
      <table data-slot="table" className={cn("w-full caption-bottom border-collapse text-left text-base", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("bg-muted text-muted-foreground", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-t border-border transition-colors first:border-t-0 hover:bg-accent/50", className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="table-head" scope="col" className={cn("h-11 whitespace-nowrap px-4 text-left align-middle text-base font-semibold", className)} {...props} />
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("px-4 py-3 align-middle", className)} {...props} />
}

/** Linha única ocupando a tabela inteira: "Nenhum usuário encontrado." */
function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-base text-muted-foreground">{children}</td>
    </tr>
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty }
