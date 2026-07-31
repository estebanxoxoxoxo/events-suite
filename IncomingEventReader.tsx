// Visor de debug: overlay fijo (500 × 250, fondo negro) con los últimos
// 5 eventos que recibió el gateway. Montarlo donde se quiera espiar.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { gateway } from "./gateway";
import type { EventEnvelope } from "./types";

const MAX_EVENTS = 5;

const styles = {
  box: {
    position: "fixed",
    right: 16,
    bottom: 16,
    width: 500,
    maxWidth: "calc(100vw - 32px)",
    height: 250,
    boxSizing: "border-box",
    padding: "14px 16px",
    borderRadius: 14,
    background: "#000",
    color: "#fff",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.6,
    overflow: "hidden",
    zIndex: 99999,
  },
  title: { opacity: 0.55, marginBottom: 8, letterSpacing: 0.5 },
  row: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  time: { opacity: 0.45 },
  props: { opacity: 0.75 },
} satisfies Record<string, CSSProperties>;

export function IncomingEventReader({ style }: { style?: CSSProperties }) {
  const [events, setEvents] = useState<EventEnvelope[]>([]);

  useEffect(() => {
    // snapshot + suscripción sin replay: idempotente bajo StrictMode
    setEvents([...gateway.history()].slice(-MAX_EVENTS).reverse());
    return gateway.subscribe(
      event => setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS)),
      { replay: false },
    );
  }, []);

  return (
    <div style={{ ...styles.box, ...style }}>
      <div style={styles.title}>gateway · últimos {MAX_EVENTS} eventos</div>
      {events.length === 0 ? (
        <div style={{ opacity: 0.4 }}>esperando eventos…</div>
      ) : (
        events.map((event, i) => (
          <div style={styles.row} key={`${event.timestamp}-${event.name}-${i}`}>
            <span style={styles.time}>{event.context.session_time_sec}s</span>{" "}
            <b>{event.name}</b>{" "}
            <span style={styles.props}>
              {event.properties ? JSON.stringify(event.properties) : ""}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
