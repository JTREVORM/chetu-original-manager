/**
 * Thin compatibility layer so the imported pages/components can keep using the
 * familiar react-router-dom API while the app actually runs on TanStack Router.
 */
import React from "react";
import {
  Link,
  useLocation as useTanstackLocation,
  useNavigate as useTanstackNavigate,
} from "@tanstack/react-router";

export function useNavigate() {
  const navigate = useTanstackNavigate();
  return React.useCallback(
    (to: string | number, options?: { replace?: boolean; state?: unknown }) => {
      if (typeof to === "number") {
        if (typeof window !== "undefined") window.history.go(to);
        return;
      }
      navigate({ to, replace: options?.replace });
    },
    [navigate],
  );
}

export function useLocation() {
  const location = useTanstackLocation();
  return {
    pathname: location.pathname,
    search: location.searchStr,
    hash: location.hash,
    state: location.state,
  };
}

type NavLinkProps = {
  to: string;
  end?: boolean;
  className?: string | ((props: { isActive: boolean }) => string);
  children?: React.ReactNode | ((props: { isActive: boolean }) => React.ReactNode);
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  title?: string;
};

export function NavLink({ to, end, className, children, ...rest }: NavLinkProps) {
  const { pathname } = useLocation();
  const isActive = end || to === "/" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Link
      to={to}
      className={typeof className === "function" ? className({ isActive }) : className}
      {...rest}
    >
      {typeof children === "function" ? children({ isActive }) : children}
    </Link>
  );
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useTanstackNavigate();
  React.useEffect(() => {
    navigate({ to, replace });
  }, [navigate, to, replace]);
  return null;
}

export { Link };
