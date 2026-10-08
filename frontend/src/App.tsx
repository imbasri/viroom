import { useEffect } from "react";
import { useHealthStore } from "./store";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

function StatusDot({ status }: { status: "idle" | "ok" | "error" }) {
  const color =
    status === "ok" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-zinc-400";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

export default function App() {
  const status = useHealthStore((s) => s.status);
  const checkHealth = useHealthStore((s) => s.checkHealth);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <main className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
      <Card className="max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>viroom</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <StatusDot status={status} />
            <span>
              Backend:{" "}
              <strong>{status === "idle" ? "checking…" : status}</strong>
            </span>
          </div>
          <Button onClick={checkHealth} variant="secondary">
            Re-check
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
