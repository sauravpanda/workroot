import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "../styles/notification-center.css";
import { Dialog, DialogContent } from "./ui/dialog";

interface Notification {
  id: string;
  subject_title: string;
  repo_name: string;
  reason: string;
  updated_at: string;
  unread: boolean;
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Notification[]>("get_notifications");
      setNotifications(result);
    } catch (e) {
      setError(String(e));
      setNotifications([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open, loadNotifications]);

  const handleMarkRead = useCallback(
    async (notifId: string) => {
      const previousNotifications = [...notifications];

      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, unread: false } : n)),
      );

      try {
        await invoke("mark_notification_read", { notificationId: notifId });
      } catch (e) {
        // Roll back to previous state on failure
        setNotifications(previousNotifications);
        setError(`Failed to mark notification as read: ${String(e)}`);
      }
    },
    [notifications],
  );

  const unreadCount = notifications.filter((n) => n.unread).length;

  if (!open) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="notif-panel" aria-label="Notifications">
        <div className="notif-header">
          <h3 className="notif-title">
            Notifications
            {unreadCount > 0 && (
              <span className="notif-count-badge">{unreadCount}</span>
            )}
          </h3>
          <div className="notif-header-actions">
            <button
              className="notif-refresh-btn"
              onClick={loadNotifications}
              disabled={loading}
            >
              Refresh
            </button>
            <button className="notif-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>

        <div className="notif-body">
          {error && <div className="notif-error">{error}</div>}

          {loading ? (
            <div className="notif-empty">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="notif-empty">No notifications.</div>
          ) : (
            <div className="notif-list" aria-live="polite">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item ${n.unread ? "notif-unread" : ""}`}
                  onClick={() => handleMarkRead(n.id)}
                >
                  {n.unread && <span className="notif-unread-dot" />}
                  <div className="notif-item-content">
                    <span className="notif-subject">{n.subject_title}</span>
                    <span className="notif-meta">
                      <span className="notif-repo">{n.repo_name}</span>
                      <span className="notif-reason-badge">{n.reason}</span>
                    </span>
                  </div>
                  <span className="notif-time">{timeAgo(n.updated_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
