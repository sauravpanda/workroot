import * as React from "react";
import { Tabs } from "radix-ui";

import { cn } from "@/lib/utils";

function TabsRoot({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Root>) {
  return (
    <Tabs.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.List>) {
  return (
    <Tabs.List
      data-slot="tabs-list"
      className={cn("inline-flex h-full items-center gap-0.5 px-1", className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "group inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs font-[450] whitespace-nowrap transition-all duration-150 ease-out select-none",
        "text-[var(--text-muted)] outline-none",
        "hover:border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0",
        "data-[state=active]:border-[var(--border)] data-[state=active]:bg-[var(--bg-elevated)] data-[state=active]:font-medium data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Content>) {
  return (
    <Tabs.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { TabsRoot, TabsList, TabsTrigger, TabsContent };
