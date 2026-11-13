import { cn } from "@/lib/utils"

const Card = ({ className, children, ...props }) => (
  <div
    className={cn(
      "rounded-lg border border-[#E5E7EB] bg-white shadow-sm hover:shadow-md transition-shadow",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

const CardHeader = ({ className, children, ...props }) => (
  <div
    className={cn("border-b border-[#E5E7EB] px-6 py-4", className)}
    {...props}
  >
    {children}
  </div>
)

const CardBody = ({ className, children, ...props }) => (
  <div className={cn("px-6 py-4", className)} {...props}>
    {children}
  </div>
)

const CardFooter = ({ className, children, ...props }) => (
  <div
    className={cn("border-t border-[#E5E7EB] px-6 py-4", className)}
    {...props}
  >
    {children}
  </div>
)

export { Card, CardHeader, CardBody, CardFooter }
export default Card
