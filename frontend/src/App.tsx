import { Suspense, useEffect, useState } from "react";
import { useHealthStore } from "./store";
import { HOME, navigation, pageFromHash, type Page } from "./lib/routes";
import Calendar from "./pages/Calendar";
import Office3D from "./pages/Office3D";
import Kanban from "./pages/Kanban";
import Memory from "./pages/Memory";
import Agents from "./pages/Agents";

/**
 * App.tsx — R7a shell: hash routing + nav tabs + health store.
 * Page bodies owned by R7b/c/d. office is a stub; kanban, memory, agents,
 * and calendar are wired directly.
 */

function PageBody({ page }: { page: Page }) {
  switch (page) {
    case "calendar":
      return <Calendar />;
    case "office":
      return <Office3D />;
    case "kanban":
      return <Kanban />;
    case "memory":
      return <Memory />;
    case "agents":
      return <Agents />;
  }
}

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash(location.hash));
  const checkHealth = useHealthStore((s) => s.checkHealth);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold text-zinc-100">viroom</span>
          <nav className="flex items-center gap-1">
            {navigation.map((slug) => {
              const active = slug === page;
              return (
                <a
                  key={slug}
                  href={slug === HOME ? "#" : `#${slug}`}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-100"
                      : "rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                  }
                >
                  {slug}
                </a>
              );
            })}
          </nav>
          <HealthStatusDot />
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Suspense fallback={<p className="text-sm text-zinc-400">Memuat …</p>}>
          <PageBody page={page} />
        </Suspense>
      </div>
    </main>
  );
}

function HealthStatusDot() {
  const status = useHealthStore((s) => s.status);
  const color =
    status === "ok" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-zinc-400";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      backend
    </span>
  );
}

