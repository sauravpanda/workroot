interface ContentToolbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  worktreeName: string;
  projectName?: string;
}

export function ContentToolbar({
  worktreeName,
  projectName,
}: ContentToolbarProps) {
  return (
    <div className="flex h-10 min-h-[40px] shrink-0 items-center border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {/* Breadcrumb */}
      <div
        className="flex min-w-[80px] shrink-0 items-center gap-[0.35em] overflow-hidden text-ellipsis whitespace-nowrap pl-3.5 pr-3 font-mono text-[11.5px] tracking-[-0.01em] text-[var(--text-secondary)] select-none"
        title={projectName ? `${projectName} / ${worktreeName}` : worktreeName}
      >
        {projectName && (
          <>
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-muted)]"
              title={projectName}
            >
              {projectName}
            </span>
            <span className="font-sans text-xs leading-none opacity-45 text-[var(--border-strong)]">
              /
            </span>
          </>
        )}
        <span
          className="overflow-hidden text-ellipsis whitespace-nowrap font-medium"
          title={worktreeName}
        >
          {worktreeName}
        </span>
      </div>
    </div>
  );
}
