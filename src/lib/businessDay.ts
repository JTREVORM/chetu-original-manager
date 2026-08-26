import { useEffect, useState } from 'react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface BusinessDayInfo {
  now: Date;
  dayName: string;
  isOpen: boolean;
  statusLabel: string;
  timeLabel: string;
  dateLabel: string;
}

export const getBusinessDayInfo = (now: Date = new Date()): BusinessDayInfo => {
  const dayIndex = now.getDay();
  const isOpen = dayIndex >= 1 && dayIndex <= 5;
  return {
    now,
    dayName: DAY_NAMES[dayIndex],
    isOpen,
    statusLabel: isOpen ? 'Open' : 'Closed',
    timeLabel: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    dateLabel: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
};

/** Live-updating business day + clock, ticking every second. */
export const useBusinessDay = (): BusinessDayInfo => {
  const [info, setInfo] = useState<BusinessDayInfo>(() => getBusinessDayInfo());

  useEffect(() => {
    const id = setInterval(() => setInfo(getBusinessDayInfo()), 1000);
    return () => clearInterval(id);
  }, []);

  return info;
};
