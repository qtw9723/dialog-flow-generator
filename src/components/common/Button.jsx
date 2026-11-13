import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { BUTTON_BASE, BUTTON_VARIANTS, BUTTON_SIZES } from "./buttonVariantClasses.js"

const buttonVariants = cva(BUTTON_BASE, {
  variants: {
    variant: BUTTON_VARIANTS,
    size: BUTTON_SIZES,
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
})

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
