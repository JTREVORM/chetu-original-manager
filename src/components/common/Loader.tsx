import React from "react";

/**
 * The app's single loading indicator: a "Loading..." wordmark whose letters
 * fill left to right. The animation and the word itself come from `.loader`
 * in styles.css, so nothing here needs to render text.
 */
export const Loader: React.FC<{
  /** `sm` for table and card bodies, `md` for full-screen states. */
  size?: "sm" | "md";
  /** Inverts the sweep for use on the navy surfaces. */
  onDark?: boolean;
  className?: string;
  /** Announced to screen readers, which cannot see the sweeping text. */
  label?: string;
}> = ({ size = "md", onDark = false, className = "", label = "Loading" }) => (
  <div
    role="status"
    aria-live="polite"
    aria-label={label}
    className={`loader ${size === "sm" ? "loader-sm" : ""} ${onDark ? "loader-on-dark" : ""} ${className}`}
  />
);

/** Centred loader for an empty panel, a table body or a whole page. */
export const LoaderBlock: React.FC<{ size?: "sm" | "md"; className?: string; label?: string }> = ({
  size = "sm",
  className = "",
  label,
}) => (
  <div className={`flex items-center justify-center py-10 ${className}`}>
    <Loader size={size} label={label} />
  </div>
);

/**
 * Full-screen veil shown while a manual refresh is in flight, so the click
 * visibly takes over the page rather than only spinning an icon in the corner.
 */
export const LoaderOverlay: React.FC<{ label?: string }> = ({ label = "Refreshing" }) => (
  <div className="loader-overlay" role="status" aria-live="polite" aria-label={label}>
    <Loader />
  </div>
);
