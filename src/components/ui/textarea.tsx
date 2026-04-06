import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-h-[60px] rounded-md border border-border-default bg-bg-elevated px-3 py-2 text-sm text-text-primary shadow-xs transition-[color,box-shadow] outline-none placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50 resize-vertical",
        "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
