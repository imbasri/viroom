import type { ReactNode } from "react";

/** Health status dot (green/red/gray) — rendered in the App shell header. */
export function StatusDot({ status }: { status: "idle" | "ok" | "error" }) {
  const color =
    status === "ok" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-zinc-400";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

interface LayoutProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Page layout shared by every R7 page: eyebrow (uppercase, small, zinc-500),
 * h1 title, optional description, right-aligned actions slot, then children
 * wrapped in `space-y-6`. The nav shell lives in App.tsx, not here.
 */
export function Layout({ eyebrow, title, description, actions, children }: LayoutProps) {
  return (
    <div className="space-y-6">
      <div>
        {eyebrow && (
          <p className="text-xs uppercase tracking-wide text-zinc-500">{eyebrow}</p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {actions}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-zinc-400">{description}</p>}
      </div>
      {children}
    </div>
  );
}