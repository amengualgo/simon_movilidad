import { useState } from "react";

/**
 * Consulta al agente de IA operativo vía la API principal (POST /chat),
 * que a su vez llama al servicio ai-agent envuelto en un circuit breaker.
 * Ver skills `ai-agent-patterns` y `circuit-breaker-patterns`.
 *
 * CHAT_ROLE es local a este componente (no viaja por la red, no se comparte
 * con el backend) — se centraliza igual como constante "as const" para
 * evitar strings "user"/"agent" sueltos.
 */
const CHAT_ROLE = {
  USER: "user",
  AGENT: "agent",
} as const;

type ChatRole = (typeof CHAT_ROLE)[keyof typeof CHAT_ROLE];

interface ChatMessage {
  role: ChatRole;
  text: string;
  degraded?: boolean;
}

export function ChatPanel() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = query;
    setMessages((prev) => [...prev, { role: CHAT_ROLE.USER, text: userMessage }]);
    setQuery("");
    setLoading(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
      const res = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMessage }),
      });

      if (!res.ok) {
        // Sin este chequeo, un 400/500 igual intenta leer data.answer,
        // que sería undefined — renderizando un mensaje vacío/confuso en
        // vez de un error claro.
        setMessages((prev) => [
          ...prev,
          { role: CHAT_ROLE.AGENT, text: "El servidor no pudo procesar la consulta." },
        ]);
        return;
      }

      const data = await res.json();
      // `degraded: true` viene del fallback del circuit breaker (ver
      // apps/api/src/lib/circuit-breaker.ts) cuando el agente de IA está
      // caído — es una respuesta genérica, no una respuesta real a la
      // consulta, así que se distingue visualmente en vez de tratarla igual
      // que una respuesta normal.
      setMessages((prev) => [...prev, { role: CHAT_ROLE.AGENT, text: data.answer, degraded: Boolean(data.degraded) }]);
    } catch (err) {
      console.error("Fallo al contactar al agente de IA:", err);
      setMessages((prev) => [...prev, { role: CHAT_ROLE.AGENT, text: "No se pudo contactar al agente." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface border border-border p-4 flex flex-col h-full">
      <h2 className="font-display text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">
        Consultas a la flota
      </h2>
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 text-sm">
        {messages.map((m, i) => (
          <div key={i} className={m.role === CHAT_ROLE.USER ? "text-right" : "text-left"}>
            <span
              className={
                m.role === CHAT_ROLE.USER
                  ? "inline-block rounded bg-moving-subtle text-text-primary px-3 py-1.5"
                  : m.degraded
                    ? "inline-block rounded border border-critical/40 bg-critical-subtle text-critical px-3 py-1.5"
                    : "inline-block rounded bg-surface-raised text-text-primary px-3 py-1.5"
              }
            >
              {m.degraded && (
                <span className="block text-[11px] font-medium uppercase tracking-wide mb-0.5">
                  Agente no disponible · el mapa sigue en vivo
                </span>
              )}
              {m.text}
            </span>
          </div>
        ))}
        {loading && <p className="text-text-muted text-xs">Consultando...</p>}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="¿Qué vehículos llevan detenidos más de 20 min?"
          className="flex-1 rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-1 focus:ring-moving"
        />
        <button
          type="submit"
          className="rounded bg-moving px-3 py-2 text-sm font-medium text-bg"
        >
          Preguntar
        </button>
      </form>
    </div>
  );
}
