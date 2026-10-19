import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Phone, PhoneOff, RefreshCw } from "lucide-react";
import { useAgentCalls } from "./AgentCallContext";
import { API_BASE_URL } from "./config";
import "./IncomingCalls.css";

function formatCallDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function IncomingCalls() {
  const {
    pendingCalls,
    actionsByCall,
    acceptingCallId,
    activeCall,
    resolvedCalls,
    connected,
    serviceError,
    acceptCall,
    rejectCall,
  } = useAgentCalls();

  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const historyRequestRef = useRef(false);

  const loadHistory = useCallback(async (quiet = false) => {
    if (historyRequestRef.current) return;
    historyRequestRef.current = true;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/calls`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load incoming call history.");
      const result = await response.json();
      if (!Array.isArray(result.calls)) throw new Error("Call history response was invalid.");
      setCalls(result.calls);
      setHistoryError("");
    } catch {
      setHistoryError("Incoming call history is unavailable. Check that the local backend is running.");
    } finally {
      historyRequestRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const pendingKey = pendingCalls.map((call) => call.callId).join("|");
  const resolvedKey = resolvedCalls.map((call) => call.callId).join("|");

  useEffect(() => {
    const refreshId = window.setTimeout(() => loadHistory(true), 0);
    return () => window.clearTimeout(refreshId);
  }, [loadHistory, pendingKey, resolvedKey, activeCall?.callId]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadHistory(true);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadHistory]);

  const historyCalls = useMemo(() => calls
    .filter((call) => call.callType === "Incoming")
    .sort((first, second) => (Date.parse(second.startedAt) || 0) - (Date.parse(first.startedAt) || 0)), [calls]);

  return (
    <div className="incoming-page">
      <div className="incoming-header">
        <h1>Incoming Calls</h1>
        <p>View and manage your incoming call history.</p>
      </div>

      <div className={`incoming-connection ${connected ? "is-online" : ""}`} role="status">
        <span className="incoming-connection-dot" />
        {connected ? "Listening for incoming calls" : "Connecting to incoming-call service…"}
      </div>

      {serviceError && <p className="incoming-error" role="alert">{serviceError}</p>}

      {pendingCalls.length > 0 && (
        <section className="incoming-alerts" aria-label="Pending incoming calls">
          {pendingCalls.map((call) => {
            const action = actionsByCall[call.callId];
            const anotherCallIsBeingAccepted = acceptingCallId && acceptingCallId !== call.callId;
            const anotherActionIsPending = Object.entries(actionsByCall)
              .some(([id, currentAction]) => id !== call.callId && Boolean(currentAction));
            const busy = Boolean(action) || !connected || Boolean(activeCall) || Boolean(anotherCallIsBeingAccepted) || anotherActionIsPending;

            return (
              <article className="incoming-alert glass" key={call.callId}>
                <div className="incoming-alert-details">
                  <span className="ringing-indicator"><span /> Ringing</span>
                  <h2>{call.customerName}</h2>
                </div>
                <div className="incoming-alert-actions">
                  <button className="incoming-accept-button" onClick={() => acceptCall(call.callId)} disabled={busy}>
                    <Phone size={17} /> {action === "accepting" ? "Accepting…" : "Accept"}
                  </button>
                  <button className="incoming-reject-button" onClick={() => rejectCall(call.callId)} disabled={busy}>
                    <PhoneOff size={17} /> {action === "rejecting" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="incoming-history-panel glass" aria-label="Saved incoming call history">
        <div className="incoming-history-heading">
          <div><h2>Incoming call history</h2><p>Calls saved by the local call service.</p></div>
          <div className="incoming-history-tools">
            <span><Clock3 size={15} /> {historyCalls.length} {historyCalls.length === 1 ? "call" : "calls"}</span>
            <button type="button" onClick={() => { setRefreshing(true); loadHistory(true); }} disabled={refreshing} aria-label="Refresh incoming call history"><RefreshCw size={15} className={refreshing ? "incoming-refreshing" : ""} /> Refresh</button>
          </div>
        </div>

        {historyError && <div className="incoming-history-error" role="alert"><span>{historyError}</span><button type="button" onClick={() => loadHistory()}>Retry</button></div>}
        {loading ? <div className="incoming-history-state">Loading incoming call history…</div> : historyError && historyCalls.length === 0 ? (
          <div className="incoming-history-state">History could not be loaded. Retry when the backend is available.</div>
        ) : historyCalls.length === 0 ? (
          <div className="incoming-history-state"><div className="incoming-history-empty-icon"><Phone size={20} /></div><h3>No incoming calls yet</h3><p>Saved incoming browser calls will appear here after a customer contacts the call centre.</p></div>
        ) : (
          <div className="incoming-table-wrapper">
            <table className="incoming-table">
              <thead><tr><th>Customer</th><th>Phone Number</th><th>Date and Time</th><th>Status</th></tr></thead>
              <tbody>{historyCalls.map((call) => (
                <tr key={call.callId}>
                  <td>{call.customerName || "Unknown customer"}</td>
                  <td>{call.phoneNumber || call.phone || "—"}</td>
                  <td>{formatCallDate(call.startedAt)}</td>
                  <td><span className={`incoming-status ${String(call.status || "unknown").toLowerCase()}`}>{call.status || "Unknown"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default IncomingCalls;
