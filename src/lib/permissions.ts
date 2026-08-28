/**
 * The permission model, read from the database.
 *
 * `role_permissions` is the authority: row level security policies and the
 * staff-management server function both evaluate it, so nothing here decides
 * anything. This module exists so a screen can grey out a control the database
 * would refuse anyway, which is a courtesy to the user rather than a control —
 * hiding a button stops nobody who can open developer tools.
 *
 * Because it is data rather than a compiled constant, tightening a role takes
 * effect on the next read instead of the next deployment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import type { UserRole } from "../types/database.types";

/** How far a permission reaches. `none` is a denial. */
export type PermissionLevel = "full" | "branch" | "own" | "limited" | "none";

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
  description: string | null;
  sort_order: number;
}

export interface RolePermissionRow {
  role: UserRole;
  permission_key: string;
  level: PermissionLevel;
}

export const PERMISSION_LEVELS: PermissionLevel[] = ["full", "branch", "own", "limited", "none"];

/** How each level reads in the matrix and on the profile drawer. */
export const LEVEL_LABEL: Record<PermissionLevel, string> = {
  full: "Full",
  branch: "Branch",
  own: "Own",
  limited: "Limited",
  none: "Denied",
};

export const LEVEL_HINT: Record<PermissionLevel, string> = {
  full: "Across the whole institution",
  branch: "Only in the branches on their profile",
  own: "Only records they registered or are assigned to",
  limited: "The action without its privileged parts",
  none: "Not permitted",
};

export const ROLE_ORDER: UserRole[] = [
  "Administrator",
  "Branch Manager",
  "Loan Officer",
  "Auditor",
];

/**
 * The whole matrix, for the Roles & Permissions screen. Readable by every
 * signed-in user: what a Loan Officer may do is not a secret, and the staff
 * profile drawer states it plainly.
 */
export function usePermissionMatrix() {
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [matrix, setMatrix] = useState<RolePermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [defs, rows] = await Promise.all([
      supabase.from("permissions").select("*").order("sort_order"),
      supabase.from("role_permissions").select("role, permission_key, level"),
    ]);
    if (defs.error || rows.error) {
      setError(
        defs.error?.message || rows.error?.message || "Could not read the permission model.",
      );
      setLoading(false);
      return;
    }
    setPermissions((defs.data || []) as PermissionDefinition[]);
    setMatrix((rows.data || []) as RolePermissionRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const levelFor = useCallback(
    (role: UserRole, key: string): PermissionLevel =>
      matrix.find((r) => r.role === role && r.permission_key === key)?.level ?? "none",
    [matrix],
  );

  const categories = useMemo(() => {
    const seen: string[] = [];
    permissions.forEach((p) => {
      if (!seen.includes(p.category)) seen.push(p.category);
    });
    return seen;
  }, [permissions]);

  /** Writing a level is refused by policy unless the caller is an Administrator. */
  const setLevel = useCallback(async (role: UserRole, key: string, level: PermissionLevel) => {
    const { error: writeError } = await supabase
      .from("role_permissions")
      .update({ level, updated_at: new Date().toISOString() })
      .eq("role", role)
      .eq("permission_key", key);
    if (writeError) throw new Error(writeError.message);
    setMatrix((prev) =>
      prev.map((r) => (r.role === role && r.permission_key === key ? { ...r, level } : r)),
    );
  }, []);

  return { permissions, matrix, categories, levelFor, setLevel, loading, error, reload: load };
}

/**
 * What the signed-in user may do, straight from `public.my_permissions()`.
 *
 * Falls back to denying everything while it loads — a screen that guesses
 * optimistically flashes controls the database is about to refuse.
 */
export function useMyPermissions() {
  const [levels, setLevels] = useState<Record<string, PermissionLevel>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase.rpc("my_permissions");
      if (cancelled) return;
      const next: Record<string, PermissionLevel> = {};
      ((data || []) as { permission_key: string; level: PermissionLevel }[]).forEach((row) => {
        next[row.permission_key] = row.level;
      });
      setLevels(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const level = useCallback((key: string): PermissionLevel => levels[key] ?? "none", [levels]);
  const can = useCallback((key: string) => (levels[key] ?? "none") !== "none", [levels]);

  return { levels, level, can, loading };
}
