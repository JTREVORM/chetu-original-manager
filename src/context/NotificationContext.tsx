import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { NotificationItem } from "../types/database.types";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { showDeviceNotification } from "../lib/pushNotifications";

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  toasts: ToastMessage[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  refreshNotifications: () => Promise<void>;
  addToast: (
    type: "success" | "error" | "info" | "warning",
    title: string,
    message: string,
  ) => void;
  removeToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastMessage["type"], title: string, message: string) => {
      const newToast: ToastMessage = {
        id: `toast-${Date.now()}-${Math.random()}`,
        type,
        title,
        message,
      };
      setToasts((prev) => [newToast, ...prev]);
      setTimeout(() => removeToast(newToast.id), 4500);
    },
    [removeToast],
  );

  const refreshNotifications = useCallback(async () => {
    if (!isSupabaseConfigured || !user?.id) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return;

    const rows = data as NotificationItem[];
    // Toast anything that arrived while the app was open (skip the first load).
    if (seenIds.current.size > 0) {
      const fresh = rows.filter((r) => !seenIds.current.has(r.id) && !r.is_read);
      fresh.slice(0, 3).forEach((r) => addToast("info", r.title, r.message));
      // The same alerts go to the device, so a phone in a pocket still buzzes.
      // Capped for the same reason the toasts are: a backlog must not spam.
      fresh.slice(0, 3).forEach((r) => {
        void showDeviceNotification({
          title: r.title,
          message: r.message,
          link_url: r.link_url,
          tag: r.id,
        });
      });
    }
    rows.forEach((r) => seenIds.current.add(r.id));
    setNotifications(rows);
  }, [user?.id, addToast]);

  // Initial load + live stream + polling fallback.
  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      seenIds.current = new Set();
      return;
    }
    refreshNotifications();

    const channel = supabase
      .channel("notifications-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        refreshNotifications();
      })
      .subscribe();

    const interval = window.setInterval(() => {
      refreshNotifications();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [user?.id, refreshNotifications]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    if (isSupabaseConfigured) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (isSupabaseConfigured && unreadIds.length) {
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        toasts,
        markAsRead,
        markAllAsRead,
        refreshNotifications,
        addToast,
        removeToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
};
