import React, { useState } from "react";
import { useNavigate } from "../lib/router-compat";
import { useAuth } from "../context/AuthContext";
import { useDatabase } from "../context/DatabaseContext";
import {
  Lock,
  ChevronRight,
  AlertCircle,
  KeyRound,
  Phone,
  Eye,
  EyeOff,
  LogIn,
  RefreshCcw,
  HeartHandshake,
  Star,
  PlusCircle,
  Users,
} from "lucide-react";

import { Profile } from "../types/database.types";
import { UgandaFlag } from "../components/common/UgandaFlag";

const FEEDBACK_WORDS = ["WE WANT", "YOUR", "FEEDBACK"];

/**
 * What the institution says it stands for, shown beside the sign-in card.
 * The card shows `label` at rest and reveals `title` + `detail` on hover or
 * keyboard focus.
 */
const CORE_VALUES = [
  {
    label: "Consistency",
    icon: RefreshCcw,
    title: "Be Consistent",
    detail: "Do the simple tasks right every day, every time.",
  },
  {
    label: "Integrity",
    icon: HeartHandshake,
    title: "Have Integrity",
    detail: "Do the right thing all the time even when no one is looking.",
  },
  {
    label: "Ambition",
    icon: Star,
    title: "Be Ambitious",
    detail: "Strive to innovate, grow, and improve in all you do.",
  },
  {
    label: "Positivity",
    icon: PlusCircle,
    title: "Be Positive",
    detail: "Stay upbeat and keep a fun attitude.",
  },
  {
    label: "Unity",
    icon: Users,
    title: "Be United",
    detail: "United as one team in all that we do.",
  },
];

export const Login: React.FC = () => {
  const { login, isLoading, needsSetup, completeSetup } = useAuth();
  const { logAudit } = useDatabase();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [setupName, setSetupName] = useState("");
  const [setupPhone, setSetupPhone] = useState("");
  const [setupPassword, setSetupPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    // Staff sign in with their email address, or with the phone number they are
    // used to — the identifier is passed through as typed and resolved by the
    // auth layer.
    const identifier = phone.trim();
    const isEmail = identifier.includes("@");
    const phoneRegex = /^07\d{8}$/;

    if (!isEmail && !phoneRegex.test(identifier)) {
      setErrorMsg("Enter your email address, or a phone number of 10 digits starting with 07.");
      return;
    }

    const credential = isEmail ? identifier.toLowerCase() : "+256" + identifier.slice(1);
    const success = await login(credential, password);
    if (success) {
      logAudit(
        "System Login",
        "Authentication",
        `User signed in with ${isEmail ? identifier.toLowerCase() : "phone number " + identifier}.`,
      );
      navigate("/");
    } else {
      setErrorMsg("Those sign-in details were not recognised. Check and try again.");
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupName.trim() || !setupPhone.trim() || !setupPassword.trim()) {
      setErrorMsg("All fields are required for first-time setup.");
      return;
    }

    const phoneRegex = /^07\d{8}$/;
    if (!phoneRegex.test(setupPhone)) {
      setErrorMsg("Phone number must be exactly 10 digits and start with 07 (e.g. 0772123456).");
      return;
    }

    const admin: Profile = {
      id: `usr-${Date.now()}`,
      phone_number: setupPhone,
      full_name: setupName,
      role: "Administrator",
      password: setupPassword,
      status: "Active",
      created_at: new Date().toISOString(),
    };
    completeSetup(admin);
    logAudit(
      "System First-Time Setup",
      "Authentication",
      `Initial Administrator account created for ${setupName}.`,
    );
    navigate("/");
  };

  if (needsSetup) {
    return (
      <div className="min-h-screen bg-chetu-navy flex flex-col justify-center py-6 sm:py-8 sm:px-6 lg:px-8 selection:bg-chetu-blue relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-chetu-blue/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-chetu-red/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-white/95 rounded-2xl shadow-xl mb-4">
            <img src="/logo.svg" alt="Chetu Microfinance Ltd" className="h-14 w-auto" />
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white uppercase">
            CHETU MICROFINANCE LTD
          </h2>
          <p className="mt-1 text-xs text-slate-300 font-semibold tracking-wider uppercase">
            First-Time Administrator Setup
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
          <div className="bg-white/95 backdrop-blur-md py-8 px-6 shadow-2xl rounded-3xl border border-white/20 sm:px-10">
            <div className="mb-6 text-center">
              <KeyRound className="w-12 h-12 text-chetu-blue mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-900">Create Administrator Account</h3>
              <p className="text-xs text-slate-500 mt-1">
                Set up the first admin user to access the system.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-800 font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSetup}>
              <div>
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  required
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  className="block w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-chetu-blue focus:border-chetu-blue"
                  placeholder="e.g. John Mukasa"
                />
              </div>

              <div>
                <label className="form-label">Phone Number</label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="h-4 w-4" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={setupPhone}
                    onChange={(e) => setSetupPhone(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-chetu-blue focus:border-chetu-blue"
                    placeholder="e.g. 0772123456"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Password</label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-chetu-blue focus:border-chetu-blue"
                    placeholder="Set a strong password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-slate-600" />
                    ) : (
                      <Eye className="h-4 w-4 text-slate-600" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 border border-transparent rounded-xl shadow-md text-xs font-bold text-white bg-chetu-blue hover:bg-chetu-darkblue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-chetu-blue transition-all flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                Create Administrator Account
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-6">
            &copy; 2026 Chetu Microfinance Ltd. All rights reserved. Secure Banking System.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-100 selection:bg-chetu-blue selection:text-white">
      {/* Soft brand wash behind everything, in place of the photographic blur. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0B4394] via-[#2C5DA6] to-amber-300" />
      <div className="pointer-events-none absolute -left-40 top-1/4 h-[28rem] w-[28rem] rounded-full bg-amber-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 -top-24 h-[26rem] w-[26rem] rounded-full bg-[#0B4394]/50 blur-3xl" />

      {/* National flag, pinned to the top-right on every screen size. */}
      <span
        className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"
        title="Uganda"
        role="img"
        aria-label="Uganda"
      >
        <UgandaFlag className="h-8 w-12 rounded-md shadow-lg ring-1 ring-white/50 sm:h-10 sm:w-16" />
      </span>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-10">
        {/* Institution mark */}
        <div className="mb-8 flex items-center gap-3 pr-16 sm:pr-20">
          <span className="inline-flex items-center justify-center rounded-xl bg-white/95 p-2 shadow-lg">
            <img src="/logo.svg" alt="Chetu Microfinance" className="h-9 w-auto" />
          </span>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight text-white sm:text-xl">
              Chetu Microfinance
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-100">
              Management Information System
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
          {/* ---------------- Left: feedback + sign in ---------------- */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              {FEEDBACK_WORDS.map((word) => (
                <span key={word} className="feedback-pill">
                  {word}
                </span>
              ))}
            </div>

            <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-white/95 sm:text-sm">
              Tell us what is working and what is not. Send your feedback or report a concern
              confidentially to{" "}
              <a
                href="mailto:director@trevordigitalsolutions.com"
                className="font-bold text-white underline decoration-amber-300 underline-offset-4 hover:text-amber-200"
              >
                director@trevordigitalsolutions.com
              </a>{" "}
              or call{" "}
              <a
                href="tel:+256740081305"
                className="font-bold text-white underline decoration-amber-300 underline-offset-4 hover:text-amber-200"
              >
                +256 740 081 305
              </a>
              .
            </p>

            {/* Sign-in card */}
            <div className="mt-7 rounded-2xl border border-white/25 bg-white/15 p-5 shadow-2xl backdrop-blur-md sm:p-6">
              <h2 className="text-base font-bold text-white">Welcome back</h2>
              <p className="mt-0.5 text-[12px] text-blue-50">
                Sign in to continue to your workspace.
              </p>

              {errorMsg && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="identifier" className="sr-only">
                    Email address or phone number
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <Phone className="h-4 w-4" />
                    </div>
                    <input
                      id="identifier"
                      type="text"
                      autoComplete="username"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="block w-full rounded-lg border-0 bg-white py-3 pl-10 pr-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="name@example.com or 0772123456"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-lg border-0 bg-white py-3 pl-10 pr-11 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="Password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-700"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-sm font-black text-white shadow-lg transition-colors hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-70"
                >
                  {isLoading ? "Signing in…" : "Log in"}
                  <LogIn className="h-4 w-4" />
                </button>

                <div className="flex items-center justify-between pt-0.5 text-[12px]">
                  <label className="flex cursor-pointer items-center gap-2 text-white/90">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded text-amber-500 focus:ring-amber-400"
                    />
                    <span>Remember session</span>
                  </label>
                  <a
                    href="#forgot"
                    onClick={(e) => {
                      e.preventDefault();
                      alert("Please contact your system administrator to reset your password.");
                    }}
                    className="font-semibold text-amber-200 hover:underline"
                  >
                    Forgot password?
                  </a>
                </div>
              </form>
            </div>
          </div>

          {/* ---------------- Right: core values ---------------- */}
          <div className="text-center">
            <h2 className="text-2xl font-black text-[#0B4394] sm:text-3xl">Core Values</h2>
            <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-white/95">
              At Chetu Microfinance, our core values guide how we lend, how we collect and how we
              treat every member and each other — so we do the right thing, the right way, every
              day.
            </p>

            {/* Hover or focus a card to read what the value means in practice. */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CORE_VALUES.map(({ label, icon: Icon, title, detail }) => (
                <div
                  key={label}
                  tabIndex={0}
                  aria-label={`${title}. ${detail}`}
                  className="value-card group relative flex h-36 items-center justify-center overflow-hidden rounded-xl border border-white/40 bg-white/20 px-3 shadow-lg backdrop-blur-sm
                             transition-all duration-300 hover:-translate-y-1 hover:border-amber-300/80 hover:bg-white/30 hover:shadow-2xl
                             focus:outline-none focus-visible:-translate-y-1 focus-visible:border-amber-300 focus-visible:bg-white/30"
                >
                  {/* Resting face: icon + one-word label. */}
                  <div className="value-face flex flex-col items-center gap-2.5">
                    <Icon className="h-8 w-8 text-[#0B4394]" strokeWidth={1.75} />
                    <span className="text-[13px] font-bold text-white">{label}</span>
                  </div>

                  {/* Revealed face: what the value actually asks of people. */}
                  <div className="value-detail absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
                    <Icon className="h-5 w-5 text-amber-200" strokeWidth={2} />
                    <p className="text-[13px] font-black leading-tight text-white">{title}</p>
                    <p className="text-[11px] leading-snug text-blue-50">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-[11px] text-blue-100">
          &copy; 2026 Chetu Microfinance Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
};
