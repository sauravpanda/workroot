import type { ReactNode, MouseEventHandler } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface FocusTrapOverlayProps {
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  children: ReactNode;
}

/**
 * A thin wrapper around a div that applies the useFocusTrap hook.
 * Use this as a drop-in replacement for `<div className="panel-overlay">`.
 */
export function FocusTrapOverlay({
  className = "panel-overlay",
  onClick,
  children,
}: FocusTrapOverlayProps) {
  const ref = useFocusTrap();

  return (
    <div className={className} ref={ref} onClick={onClick}>
      {children}
    </div>
  );
}
