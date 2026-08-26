import React from 'react';
import { CalendarDays, X } from 'lucide-react';
import { useBusinessDay } from '../../lib/businessDay';

interface BusinessDayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessDayModal: React.FC<BusinessDayModalProps> = ({ isOpen, onClose }) => {
  const { dayName, isOpen: isBusinessOpen, statusLabel, timeLabel, dateLabel } = useBusinessDay();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden">
        <div className="p-5 bg-chetu-navy text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold">Business Day</h3>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <div
            className={`flex items-center justify-between p-4 rounded-xl border ${
              isBusinessOpen ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
            }`}
          >
            <div>
              <p className="text-sm font-black text-slate-900">{dayName}</p>
              <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{dateLabel}</p>
            </div>
            <span
              className={`text-xs font-black uppercase ${isBusinessOpen ? 'text-emerald-600' : 'text-chetu-red'}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-xs font-bold text-slate-700">Current time</span>
            <span className="text-xs font-black text-slate-900 tabular-nums">{timeLabel}</span>
          </div>

          <p className="text-[11px] text-slate-500 text-center pt-1">
            Business hours run Monday to Friday. Saturday and Sunday are closed.
          </p>
        </div>
      </div>
    </div>
  );
};
