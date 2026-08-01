import * as React from "react"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "flex min-h-14 w-full items-stretch rounded-2xl border border-border bg-background shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, align = "center", ...props }: React.ComponentProps<"div"> & { align?: "center" | "block-end" }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "flex shrink-0 items-center gap-1 px-2 data-[align=block-end]:items-end data-[align=block-end]:pb-2",
        className
      )}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  variant = "outline",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button> & VariantProps<typeof buttonVariants>) {
  return (
    <Button
      data-slot="input-group-button"
      variant={variant}
      size={size}
      className={cn("rounded-xl", className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupButton }
