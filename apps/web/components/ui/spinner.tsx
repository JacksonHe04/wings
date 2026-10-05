import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

/** 与 fde-anything 的 `components/ui/spinner.tsx` 同源——两个产品的转圈要长得一样。 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
