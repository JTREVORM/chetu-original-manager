import React from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
}

const initials = (name?: string | null) =>
  (name || '?')
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * Renders a photo when one exists, otherwise initials.
 * Never renders <img src=""> (which makes browsers re-request the page).
 */
export const Avatar: React.FC<AvatarProps> = ({ src, name, className = '' }) => {
  if (src) {
    return <img src={src} alt={name || 'Avatar'} className={`object-cover ${className}`} />;
  }
  return (
    <span
      aria-label={name || 'Avatar'}
      className={`inline-flex items-center justify-center bg-slate-200 text-slate-600 font-black text-[11px] ${className}`}
    >
      {initials(name)}
    </span>
  );
};
