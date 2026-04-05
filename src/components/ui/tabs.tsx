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
      className={cn("inline-flex h-full items-stretch", className)}
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
        "inline-flex shrink-0 cursor-pointer items-center gap-[5px] border-b-2 border-transparent px-3 text-[11.5px] font-normal whitespace-nowrap transition-colors duration-[0.12s] select-none outline-none",
        "text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--bg-elevated)_60%,transparent)] hover:text-[var(--text-secondary)]",
        "data-[state=active]:border-b-[var(--accent)] data-[state=active]:bg-[color-mix(in_srgb,var(--accent-muted)_40%,transparent)] data-[state=active]:font-medium data-[state=active]:text-[var(--text-primary)]",
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
