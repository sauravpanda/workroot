import { TabsRoot, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";

interface ContentToolbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  worktreeName: string;
  projectName?: string;
}

const TABS = [
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[13px] shrink-0"
      >
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <path d="M4.5 6l2.5 2-2.5 2" />
        <path d="M8.5 10.5h3" />
      </svg>
    ),
  },
  {
    id: "changes",
    label: "Changes",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[13px] shrink-0"
      >
        <path d="M8 2v12" />
        <path d="M4 6l4-4 4 4" />
        <path d="M3 10h10" />
      </svg>
    ),
  },
  {
    id: "pr",
    label: "PR",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[13px] shrink-0"
      >
        <circle cx="5" cy="3.5" r="1.5" />
        <circle cx="5" cy="12.5" r="1.5" />
        <circle cx="11" cy="12.5" r="1.5" />
        <path d="M5 5v6" />
        <path d="M11 5v6" />
        <path d="M11 5c0-1.5-1-2-3-2" />
      </svg>
    ),
  },
  {
    id: "tests",
    label: "Tests",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[13px] shrink-0"
      >
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Security",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[13px] shrink-0"
      >
        <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
      </svg>
    ),
  },
  {
    id: "docker",
    label: "Docker",
    icon: (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[13px] shrink-0"
      >
        <rect x="1.5" y="6" width="13" height="7" rx="1" />
        <path d="M4 6V4.5a1 1 0 011-1h6a1 1 0 011 1V6" />
        <path d="M5.5 9h0" />
        <path d="M8 9h0" />
        <path d="M10.5 9h0" />
      </svg>
    ),
  },
] as const;

export function ContentToolbar({
  activeTab,
  onTabChange,
  worktreeName,
  projectName,
}: ContentToolbarProps) {
  return (
    <div className="flex h-[38px] min-h-[38px] shrink-0 items-center border-b border-[var(--border-subtle)] bg-gradient-to-b from-[color-mix(in_srgb,var(--bg-elevated)_50%,var(--bg-surface))] to-[var(--bg-surface)]">
      {/* Breadcrumb */}
      <div className="flex min-w-0 shrink items-center gap-[0.3em] overflow-hidden text-ellipsis whitespace-nowrap px-[14px] pr-[10px] font-mono text-[11.5px] tracking-[-0.01em] text-[var(--text-secondary)] select-none">
        {projectName && (
          <>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-muted)]">
              {projectName}
            </span>
            <span className="font-sans text-[13px] leading-none opacity-60 text-[var(--border-strong)]">
              /
            </span>
          </>
        )}
        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
          {worktreeName}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-0.5 h-[18px] w-px shrink-0 bg-gradient-to-b from-transparent via-[var(--border)] to-transparent" />

      {/* Scrollable tabs */}
      <TabsRoot
        value={activeTab}
        onValueChange={onTabChange}
        className="min-w-0 flex-1 self-stretch"
      >
        <ScrollArea className="h-full" type="scroll">
          <TabsList className="h-[38px] flex-nowrap">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="h-full">
                <span className="opacity-70 data-[state=active]:opacity-100 data-[state=active]:text-[var(--accent)]">
                  {tab.icon}
                </span>
                <span className="leading-none">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TabsRoot>
    </div>
  );
}
