import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Phone, PhoneOff } from "lucide-react";
import VoiceCall from "./VoiceCall";
import "./IncomingCalls.css";

const initialCalls = [
  {
    id: 1,
    name: "Priya Sharma",
    phone: "9876543210",
    time: "10:30 AM",
    status: "Missed",
  },
  {
    id: 2,
    name: "Amit Kumar",
    phone: "9876543211",
    time: "11:15 AM",
    status: "Answered",
  },
  {
    id: 3,
    name: "Sneha Rao",
    phone: "9876543212",
    time: "12:00 PM",
    status: "Missed",
  },
];

function IncomingCalls() {
  const [calls, setCalls] = useState(initialCalls);
  const [pendingCalls, setPendingCalls] = useState([]);
  const [actionsByCall, setActionsByCall] = useState({});
  const [activeCall, setActiveCall] = useState(null);
  const [acceptingCallId, setAcceptingCallId] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [agentError, setAgentError] = useState("");
  const socketRef = useRef(null);
  const pendingCallsRef = useRef([]);
  const acceptingCallIdRef = useRef(null);

  useEffect(() => {
    const socket = io("http://localhost:3001", {
      autoConnect: false,
      forceNew: true,
    });
    socketRef.current = socket;

    function handleConnect() {
      setSocketConnected(true);
      setAgentError("");
      socket.emit("register-agent");
      console.log("Agent connected to Socket.IO");
    }

    function handleDisconnect() {
      setSocketConnected(false);
      setAgentError("Connection to the incoming-call service was lost. Reconnecting…");
      setActionsByCall({});
      acceptingCallIdRef.current = null;
      setAcceptingCallId(null);
    }

    function handleConnectError(error) {
      setSocketConnected(false);
      setAgentError("Connection to the incoming-call service was interrupted. Reconnecting…");
      console.error("Unable to connect to the incoming-call service:", error?.message);
    }

    function handleIncomingCall(payload) {
      if (
        typeof payload?.callId !== "string" ||
        !payload.callId ||
        typeof payload.customerName !== "string" ||
        !payload.customerName.trim()
      ) {
        return;
      }

      const current = pendingCallsRef.current;
      if (current.some((call) => call.callId === payload.callId)) return;
      const next = [
        ...current,
        { callId: payload.callId, customerName: payload.customerName.trim() },
      ];
      pendingCallsRef.current = next;
      setPendingCalls(next);
      setAgentError("");
    }

    function handleCallAccepted(payload) {
      if (
        typeof payload?.callId !== "string" ||
        typeof payload.roomName !== "string" ||
        !payload.roomName
      ) {
        acceptingCallIdRef.current = null;
        setAcceptingCallId(null);
        setAgentError("The server confirmed the call without a valid room. Please try again.");
        return;
      }
      if (!pendingCallsRef.current.some((call) => call.callId === payload.callId)) return;

      const next = pendingCallsRef.current.filter((call) => call.callId !== payload.callId);
      pendingCallsRef.current = next;
      setPendingCalls(next);
      setActionsByCall((current) => {
        const updated = { ...current };
        delete updated[payload.callId];
        return updated;
      });
      acceptingCallIdRef.current = null;
      setAcceptingCallId(null);
      setAgentError("");
      setActiveCall({
        callId: payload.callId,
        roomName: payload.roomName,
        customerName: payload.customerName || "Incoming caller",
      });
    }

    function handleCallResolved(payload) {
      if (typeof payload?.callId !== "string") return;

      const current = pendingCallsRef.current;
      const resolvedCall = current.find((call) => call.callId === payload.callId);
      const next = current.filter((call) => call.callId !== payload.callId);
      pendingCallsRef.current = next;
      setPendingCalls(next);
      setActionsByCall((previous) => {
        const updated = { ...previous };
        delete updated[payload.callId];
        return updated;
      });

      if (acceptingCallIdRef.current === payload.callId) {
        acceptingCallIdRef.current = null;
        setAcceptingCallId(null);
      }

      if (
        payload.status === "rejected" &&
        resolvedCall
      ) {
        setCalls((previous) => [
          {
            id: payload.callId,
            name: payload.customerName || resolvedCall.customerName,
            phone: "—",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            status: "Rejected",
          },
          ...previous,
        ]);
      }

      if (resolvedCall && payload.status === "expired") {
        setAgentError(`The call from ${resolvedCall.customerName} expired before you could respond.`);
      } else if (resolvedCall && payload.status === "caller-disconnected") {
        setAgentError(`${resolvedCall.customerName} ended the call.`);
      } else if (resolvedCall && payload.status === "accepted") {
        setAgentError("Another agent accepted this call.");
      }
    }

    function handleCallError(payload) {
      setAgentError(payload?.message || "The call could not be processed. It may have expired or been answered by another agent.");
      setActionsByCall({});
      acceptingCallIdRef.current = null;
      setAcceptingCallId(null);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("call-resolved", handleCallResolved);
    socket.on("call-error", handleCallError);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("call-resolved", handleCallResolved);
      socket.off("call-error", handleCallError);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, []);

  function acceptCall(callId) {
    const socket = socketRef.current;
    if (!socket?.connected || activeCall || acceptingCallIdRef.current) return;
    if (!pendingCallsRef.current.some((call) => call.callId === callId)) return;

    acceptingCallIdRef.current = callId;
    setAcceptingCallId(callId);
    setActionsByCall((current) => ({ ...current, [callId]: "accepting" }));
    setAgentError("");
    socket.emit("accept-call", { callId });
  }

  function rejectCall(callId) {
    const socket = socketRef.current;
    if (!socket?.connected || actionsByCall[callId]) return;
    if (!pendingCallsRef.current.some((call) => call.callId === callId)) return;

    setActionsByCall((current) => ({ ...current, [callId]: "rejecting" }));
    setAgentError("");
    socket.emit("reject-call", { callId });
  }

  return (
    <div className="incoming-page">
      <div className="incoming-header">
        <h1>Incoming Calls</h1>
        <p>View and manage your incoming call history.</p>
      </div>

      <div className={`incoming-connection ${socketConnected ? "is-online" : ""}`} role="status">
        <span className="incoming-connection-dot" />
        {socketConnected ? "Listening for incoming calls" : "Connecting to incoming-call service…"}
      </div>

      {agentError && <p className="incoming-error" role="alert">{agentError}</p>}

      {pendingCalls.length > 0 && (
        <section className="incoming-alerts" aria-label="Pending incoming calls">
          {pendingCalls.map((call) => {
            const action = actionsByCall[call.callId];
            const anotherCallIsBeingAccepted =
              acceptingCallId && acceptingCallId !== call.callId;
            const busy =
              Boolean(action) ||
              !socketConnected ||
              Boolean(activeCall) ||
              Boolean(anotherCallIsBeingAccepted);

            return (
              <article className="incoming-alert glass" key={call.callId}>
                <div className="incoming-alert-details">
                  <span className="ringing-indicator"><span /> Ringing</span>
                  <h2>{call.customerName}</h2>
                </div>
                <div className="incoming-alert-actions">
                  <button
                    className="incoming-accept-button"
                    onClick={() => acceptCall(call.callId)}
                    disabled={busy}
                  >
                    <Phone size={17} />
                    {action === "accepting" ? "Accepting…" : "Accept"}
                  </button>
                  <button
                    className="incoming-reject-button"
                    onClick={() => rejectCall(call.callId)}
                    disabled={busy}
                  >
                    <PhoneOff size={17} />
                    {action === "rejecting" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {activeCall && (
        <section className="incoming-active-call glass" aria-label="Active incoming call">
          <h2>Call with {activeCall.customerName}</h2>
          <VoiceCall
            roomName={activeCall.roomName}
            participantName="Call Centre Agent"
            onLeave={() => setActiveCall(null)}
          />
        </section>
      )}

      <div className="incoming-table-wrapper">
        <table className="incoming-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone Number</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{call.name}</td>
                <td>{call.phone}</td>
                <td>{call.time}</td>
                <td>
                  <span
                    className={`incoming-status ${call.status.toLowerCase()}`}
                  >
                    {call.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default IncomingCalls;
