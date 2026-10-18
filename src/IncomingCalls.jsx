import { Phone, PhoneOff } from "lucide-react";
import { useAgentCalls } from "./AgentCallContext";
import "./IncomingCalls.css";

const initialCalls = [
  { id: 1, name: "Priya Sharma", phone: "9876543210", time: "10:30 AM", status: "Missed" },
  { id: 2, name: "Amit Kumar", phone: "9876543211", time: "11:15 AM", status: "Answered" },
  { id: 3, name: "Sneha Rao", phone: "9876543212", time: "12:00 PM", status: "Missed" },
];

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

  const historyCalls = [
    ...resolvedCalls
      .filter((call) => call.status === "Rejected")
      .map((call) => ({
        id: call.callId,
        name: call.customerName,
        phone: "—",
        time: new Date(call.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: call.status,
      })),
    ...initialCalls,
  ];

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

      <div className="incoming-table-wrapper">
        <table className="incoming-table">
          <thead>
            <tr><th>Customer</th><th>Phone Number</th><th>Time</th><th>Status</th></tr>
          </thead>
          <tbody>
            {historyCalls.map((call) => (
              <tr key={call.id}>
                <td>{call.name}</td>
                <td>{call.phone}</td>
                <td>{call.time}</td>
                <td><span className={`incoming-status ${call.status.toLowerCase()}`}>{call.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default IncomingCalls;
