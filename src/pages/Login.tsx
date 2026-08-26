import React, { useState } from 'react';
import { useNavigate } from '../lib/router-compat';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import { Lock, ChevronRight, AlertCircle, KeyRound, Phone, Eye, EyeOff } from 'lucide-react';

import { Profile } from '../types/database.types';

export const Login: React.FC = () => {
  const { login, isLoading, needsSetup, completeSetup } = useAuth();
  const { logAudit } = useDatabase();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [setupName, setSetupName] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupPassword, setSetupPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Staff sign in with their email address, or with the phone number they are
    // used to — the identifier is passed through as typed and resolved by the
    // auth layer.
    const identifier = phone.trim();
    const isEmail = identifier.includes('@');
    const phoneRegex = /^07\d{8}$/;

    if (!isEmail && !phoneRegex.test(identifier)) {
      setErrorMsg('Enter your email address, or a phone number of 10 digits starting with 07.');
      return;
    }

    const credential = isEmail ? identifier.toLowerCase() : '+256' + identifier.slice(1);
    const success = await login(credential, password);
    if (success) {
      logAudit('System Login', 'Authentication', `User signed in with ${isEmail ? identifier.toLowerCase() : 'phone number ' + identifier}.`);
      navigate('/');
    } else {
      setErrorMsg('Those sign-in details were not recognised. Check and try again.');
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupName.trim() || !setupPhone.trim() || !setupPassword.trim()) {
      setErrorMsg('All fields are required for first-time setup.');
      return;
    }

    const phoneRegex = /^07\d{8}$/;
    if (!phoneRegex.test(setupPhone)) {
      setErrorMsg('Phone number must be exactly 10 digits and start with 07 (e.g. 0772123456).');
      return;
    }

    const admin: Profile = {
      id: `usr-${Date.now()}`,
      phone_number: setupPhone,
      full_name: setupName,
      role: 'Administrator',
      password: setupPassword,
      status: 'Active',
      created_at: new Date().toISOString()
    };
    completeSetup(admin);
    logAudit('System First-Time Setup', 'Authentication', `Initial Administrator account created for ${setupName}.`);
    navigate('/');
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
              <p className="text-xs text-slate-500 mt-1">Set up the first admin user to access the system.</p>
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
                    type={showPassword ? 'text' : 'password'}
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
                    {showPassword ? <EyeOff className="h-4 w-4 text-slate-600" /> : <Eye className="h-4 w-4 text-slate-600" />}
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
          Enterprise Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="bg-white/95 backdrop-blur-md py-8 px-6 shadow-2xl rounded-3xl border border-white/20 sm:px-10">
          
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-800 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="form-label">
                Email or Phone Number
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-chetu-blue focus:border-chetu-blue"
                  placeholder="name@example.com or 0772123456"
                />
              </div>
            </div>

            <div>
              <label className="form-label">
                Password
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-chetu-blue focus:border-chetu-blue"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-slate-600" /> : <Eye className="h-4 w-4 text-slate-600" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded text-chetu-blue focus:ring-chetu-blue" />
                <span>Remember session</span>
              </label>
              <a href="#forgot" onClick={(e) => { e.preventDefault(); alert('Please contact system administrator to reset password.'); }} className="font-semibold text-chetu-blue hover:underline">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 border border-transparent rounded-xl shadow-md text-xs font-bold text-white bg-chetu-blue hover:bg-chetu-darkblue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-chetu-blue transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">
          &copy; 2026 Chetu Microfinance Ltd. All rights reserved. Secure Banking System.
        </p>
      </div>
    </div>
  );
};
