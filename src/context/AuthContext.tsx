import React, { createContext, useContext, useState, useEffect } from "react";
import { Profile, UserRole } from "../types/database.types";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { getInitialUsers, saveUsers } from "../lib/defaults";

interface AuthContextType {
  user: Profile | null;
  role: UserRole;
  isAdmin: boolean;
  isLoanOfficer: boolean;
  isBranchManager: boolean;
  isAuditor: boolean;
  login: (phoneNumber: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  isLoading: boolean;
  /**
   * Whether Supabase has finished restoring (or refusing) a session.
   *
   * `user` is hydrated synchronously from localStorage, so it is present on the
   * very first render of a reload — but the supabase-js client loads its own
   * session asynchronously, and until it has, every query it sends goes out as
   * `anon` and comes back 401. Anything that reads an RLS-protected table must
   * wait for this rather than for `user`.
   *
   * It becomes true once the session is known, whether or not one exists, so a
   * signed-out visitor is not left waiting forever.
   */
  isAuthResolved: boolean;
  needsSetup: boolean;
  completeSetup: (admin: Profile) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(() => {
    const saved = localStorage.getItem("chetu_auth_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Without Supabase there is no session to wait for, so the local-development
  // path is resolved from the outset and nothing ever blocks on it.
  const [isAuthResolved, setIsAuthResolved] = useState<boolean>(!isSupabaseConfigured);
  const [needsSetup, setNeedsSetup] = useState<boolean>(() => {
    // If Supabase is configured, users exist in Supabase Auth, not localStorage
    if (isSupabaseConfigured) return false;
    const users = getInitialUsers();
    return users.length === 0;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("chetu_auth_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("chetu_auth_user");
    }
  }, [user]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      const syncProfile = async (
        sessionUser: NonNullable<
          Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]
        >["user"],
      ) => {
        // profiles is the source of truth for role/status. Only create a row
        // the first time a user is ever seen (e.g. bootstrapping the first
        // Administrator) — never overwrite an existing row's role/status here,
        // that would silently undo changes made via User Management.
        const { data: existing } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionUser.id)
          .maybeSingle();

        if (existing) {
          setUser(existing as Profile);
          return;
        }

        // A profile can be created here only as a first-seen fallback. Do not
        // trust arbitrary role metadata from the auth client; privileged roles
        // are provisioned through the administrator-only staff workflow.
        const fallbackRole: UserRole = "Loan Officer";

        // The `handle_new_user` trigger may already have created this row a
        // moment ago (race on first sign-in), so a plain insert can fail with a
        // duplicate-key error. Fall back to re-reading the row in that case.
        const { data: created } = await supabase
          .from("profiles")
          .insert({
            id: sessionUser.id,
            email: sessionUser.email || "",
            full_name:
              sessionUser.user_metadata?.full_name ||
              sessionUser.email?.split("@")[0] ||
              "System User",
            role: fallbackRole,
            phone_number: sessionUser.phone || null,
            status: "Active",
          })
          .select()
          .maybeSingle();

        if (created) {
          setUser(created as Profile);
          return;
        }

        const { data: fallback } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionUser.id)
          .maybeSingle();
        if (fallback) setUser(fallback as Profile);
      };

      // Resolving this settles the gate whichever way it goes: a restored
      // session, no session at all, or a failure to read one. A rejection that
      // left the flag false would strand the app on an empty workspace.
      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (session?.user) syncProfile(session.user);
        })
        .catch(() => undefined)
        .finally(() => setIsAuthResolved(true));

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          syncProfile(session.user);
        } else {
          setUser(null);
        }
        // INITIAL_SESSION arrives here too, so the gate opens even if the
        // call above is still in flight.
        setIsAuthResolved(true);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const toE164 = (phone: string): string => {
    const trimmed = phone.trim();
    if (trimmed.startsWith("+")) return trimmed;
    return `+256${trimmed.replace(/^0/, "")}`;
  };

  const phoneToEmail = (e164Phone: string): string => {
    return `${e164Phone.replace("+", "")}@staff.chetumicrofinance.local`;
  };

  const login = async (phoneNumber: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const cleanPhone = phoneNumber.trim();

      if (isSupabaseConfigured) {
        // Production auth path: Supabase is the single source of truth.
        // No local fallback / seeded credentials — avoids shipping a
        // hardcoded backdoor account in a live financial system.
        //
        // Staff sign in with their own email address, but may also type their
        // phone number, which is what field officers are used to. A phone is
        // resolved to the account email through a database function, because
        // nothing can be read from `profiles` before a session exists.
        // Accounts created before real emails existed still carry the derived
        // address, so that is tried as a fallback.
        const candidates: string[] = [];
        if (cleanPhone.includes("@")) {
          candidates.push(cleanPhone.toLowerCase());
        } else {
          const { data: resolved } = await supabase.rpc("account_email_for_phone", {
            _phone: cleanPhone,
          });
          if (typeof resolved === "string" && resolved) candidates.push(resolved);
          candidates.push(phoneToEmail(toE164(cleanPhone)));
        }

        let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | null =
          null;
        for (const email of candidates) {
          const attempt = await supabase.auth.signInWithPassword({ email, password });
          if (!attempt.error && attempt.data.session?.user) {
            data = attempt.data;
            break;
          }
        }
        if (!data?.session?.user) {
          // Counted against the account so Staff Management can show a run of
          // failures. The function returns nothing whether or not the
          // identifier matches anybody, so it cannot be used to discover which
          // addresses and phone numbers are real.
          await supabase.rpc("record_failed_login", { _identifier: cleanPhone }).then(
            () => undefined,
            () => undefined,
          );
          setIsLoading(false);
          return false;
        }

        // Stamp the sign-in before the profile is read, so `last_login_at` and
        // a Pending→Active transition are already on the row that comes back.
        // The timestamp is the database's, never this device's clock.
        await supabase.rpc("record_successful_login").then(
          () => undefined,
          () => undefined,
        );

        // Hydrate the profile BEFORE returning so the protected layout does not
        // bounce back to /login on the first attempt.
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (profile) setUser(profile as Profile);
        setIsLoading(false);
        return true;
      }

      // Local-only path: used solely for local development when no
      // Supabase project is configured (no VITE_SUPABASE_* env vars set).
      // This branch never runs in a properly configured deployment.
      const users = getInitialUsers();
      const matched = users.find((u) => {
        const storedPhone = u.phone_number || "";
        const normalizedStored = storedPhone.replace(/\s/g, "");
        const normalizedInput = cleanPhone.replace(/\s/g, "");
        return (
          (normalizedStored === normalizedInput ||
            normalizedStored === normalizedInput.replace("+256", "0") ||
            normalizedInput === normalizedStored.replace("+256", "0")) &&
          u.password === password
        );
      });

      if (matched) {
        setUser({ ...matched, phone_number: matched.phone_number });
        setIsLoading(false);
        return true;
      }

      setIsLoading(false);
      return false;
    } catch {
      setIsLoading(false);
      return false;
    }
  };

  const logout = () => {
    if (isSupabaseConfigured) {
      supabase.auth.signOut();
    }
    setUser(null);
  };

  const refreshProfile = async () => {
    if (!isSupabaseConfigured) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();
    if (data) setUser(data as Profile);
  };

  const completeSetup = (admin: Profile) => {
    const users = getInitialUsers();
    users.push(admin);
    saveUsers(users);
    setNeedsSetup(false);
    setUser(admin);
  };

  const role: UserRole = user?.role || "Loan Officer";
  const isAdmin = role === "Administrator";
  const isBranchManager = role === "Branch Manager";
  const isLoanOfficer = role === "Loan Officer";
  const isAuditor = role === "Auditor";

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin,
        isLoanOfficer,
        isBranchManager,
        isAuditor,
        login,
        logout,
        refreshProfile,
        isLoading,
        isAuthResolved,
        needsSetup,
        completeSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
