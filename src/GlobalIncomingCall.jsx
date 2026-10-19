import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Wifi, WifiOff, X } from "lucide-react";
import { io } from "socket.io-client";
import VoiceCall from "./VoiceCall";
import { API_BASE_URL } from "./config";
import { AgentCallContext, useAgentCalls } from "./AgentCallContext";
import "./GlobalIncomingCall.css";

export function AgentCallProvider({ children }) {
  const [pendingCalls, setPendingCalls] = useState([]);
  const [actionsByCall, setActionsByCall] = useState({});
  const [activeCall, setActiveCall] = useState(null);
  const [resolvedCalls, setResolvedCalls] = useState([]);
  const [connected, setConnected] = useState(false);
  const [serviceError, setServiceError] = useState("");
  const [acceptingCallId, setAcceptingCallId] = useState(null);
  const socketRef = useRef(null);
  const pendingRef = useRef([]);
  const actionsRef = useRef({});
  const activeRef = useRef(null);
  const acceptingCallIdRef = useRef(null);

  function replacePending(next) {
    pendingRef.current = next;
    setPendingCalls(next);
  }

  function replaceActions(next) {
    actionsRef.current = next;
    setActionsByCall(next);
  }

  function removePending(callId) {
    replacePending(pendingRef.current.filter((call) => call.callId !== callId));
    const nextActions = { ...actionsRef.current };
    delete nextActions[callId];
    replaceActions(nextActions);
    if (acceptingCallIdRef.current === callId) {
      acceptingCallIdRef.current = null;
      setAcceptingCallId(null);
    }
  }

  useEffect(() => {
    const socket = io(API_BASE_URL, { autoConnect: false, forceNew: true });
    socketRef.current = socket;

    function handleConnect() {
      setConnected(true);
      setServiceError("");
      socket.emit("register-agent");
      console.info("[agent-calls] connected and registered");
    }

    function handleDisconnect() {
      setConnected(false);
      setServiceError("Call service disconnected. Reconnecting…");
      acceptingCallIdRef.current = null;
      setAcceptingCallId(null);
      replaceActions({});
      if (activeRef.current) {
        activeRef.current = null;
        setActiveCall(null);
      }
    }

    function handleConnectError() {
      setConnected(false);
      setServiceError("Unable to connect to the call service. Reconnecting…");
    }

    function handleIncomingCall(payload) {
      if (
        typeof payload?.callId !== "string" ||
        !payload.callId ||
        typeof payload.customerName !== "string" ||
        !payload.customerName.trim() ||
        typeof payload.roomName !== "string" ||
        !payload.roomName
      ) return;

      if (pendingRef.current.some((call) => call.callId === payload.callId)) return;
      replacePending([...pendingRef.current, {
        callId: payload.callId,
        customerName: payload.customerName.trim(),
        roomName: payload.roomName,
      }]);
      setServiceError("");
    }

    function handleCallAccepted(payload) {
      if (
        typeof payload?.callId !== "string" ||
        typeof payload.roomName !== "string" ||
        !payload.roomName ||
        !pendingRef.current.some((call) => call.callId === payload.callId)
      ) return;

      const pending = pendingRef.current.find((call) => call.callId === payload.callId);
      removePending(payload.callId);
      const accepted = {
        callId: payload.callId,
        roomName: payload.roomName,
        customerName: payload.customerName || pending.customerName,
      };
      activeRef.current = accepted;
      setActiveCall(accepted);
      setServiceError("");
    }

    function handleCallResolved(payload) {
      if (typeof payload?.callId !== "string") return;
      const call = pendingRef.current.find((item) => item.callId === payload.callId);
      removePending(payload.callId);

      if (payload.status === "rejected" && call) {
        setResolvedCalls((current) => current.some((item) => item.callId === payload.callId)
          ? current
          : [{
              callId: payload.callId,
              customerName: payload.customerName || call.customerName,
              status: "Rejected",
              occurredAt: new Date().toISOString(),
            }, ...current]);
      } else if (payload.status === "expired" && call) {
        setServiceError(`The call from ${call.customerName} expired.`);
      } else if (payload.status === "caller-disconnected" && call) {
        setServiceError(`${call.customerName} cancelled the call.`);
      } else if (payload.status === "accepted" && call) {
        setServiceError("Another agent accepted this call.");
      }
    }

    function handleCallError(payload) {
      if (payload?.callId && !pendingRef.current.some((call) => call.callId === payload.callId)) return;
      setServiceError(payload?.message || "The call action could not be completed.");
      if (payload?.callId) {
        const next = { ...actionsRef.current };
        delete next[payload.callId];
        replaceActions(next);
        if (acceptingCallIdRef.current === payload.callId) {
          acceptingCallIdRef.current = null;
          setAcceptingCallId(null);
        }
      } else {
        acceptingCallIdRef.current = null;
        setAcceptingCallId(null);
        replaceActions({});
      }
    }

    function clearActiveCall(payload, message) {
      if (activeRef.current?.callId !== payload?.callId) return;
      activeRef.current = null;
      setActiveCall(null);
      setServiceError(message);
    }

    function handleRemoteEnded(payload) {
      clearActiveCall(payload, "The customer ended the call.");
    }

    function handleAudioTimeout(payload) {
      clearActiveCall(payload, "The call could not establish LiveKit audio and was recorded as missed.");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("call-resolved", handleCallResolved);
    socket.on("call-error", handleCallError);
    socket.on("call-remote-ended", handleRemoteEnded);
    socket.on("call-audio-timeout", handleAudioTimeout);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("call-resolved", handleCallResolved);
      socket.off("call-error", handleCallError);
      socket.off("call-remote-ended", handleRemoteEnded);
      socket.off("call-audio-timeout", handleAudioTimeout);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, []);

  function acceptCall(callId) {
    const socket = socketRef.current;
    if (
      !connected ||
      !socket?.connected ||
      activeRef.current ||
      acceptingCallIdRef.current ||
      Object.keys(actionsRef.current).length > 0
    ) return;
    if (!pendingRef.current.some((call) => call.callId === callId)) return;

    acceptingCallIdRef.current = callId;
    setAcceptingCallId(callId);
    replaceActions({ ...actionsRef.current, [callId]: "accepting" });
    setServiceError("");
    socket.emit("accept-call", { callId });
  }

  function rejectCall(callId) {
    const socket = socketRef.current;
    if (
      !connected ||
      !socket?.connected ||
      Object.keys(actionsRef.current).length > 0 ||
      acceptingCallIdRef.current ||
      activeRef.current
    ) return;
    if (!pendingRef.current.some((call) => call.callId === callId)) return;

    replaceActions({ ...actionsRef.current, [callId]: "rejecting" });
    setServiceError("");
    socket.emit("reject-call", { callId });
  }

  function leaveActiveCall() {
    activeRef.current = null;
    setActiveCall(null);
  }

  function clearServiceError() {
    setServiceError("");
  }

  const value = {
    pendingCalls,
    actionsByCall,
    acceptingCallId,
    activeCall,
    resolvedCalls,
    connected,
    serviceError,
    clearServiceError,
    leaveActiveCall,
    acceptCall,
    rejectCall,
    socketRef,
  };

  return (
    <AgentCallContext.Provider value={value}>
      {children}
    </AgentCallContext.Provider>
  );
}

export default function GlobalIncomingCall({ activePage }) {
  const {
    pendingCalls,
    actionsByCall,
    acceptingCallId,
    activeCall,
    connected,
    serviceError,
    clearServiceError,
    leaveActiveCall,
    acceptCall,
    rejectCall,
    socketRef,
  } = useAgentCalls();

  return (
    <aside className="global-call-layer" aria-live="polite">
      {pendingCalls.length > 0 && activePage !== "Incoming" && (
        <section className="global-call-notifications" aria-label="Incoming call notifications">
          {pendingCalls.map((call) => {
            const action = actionsByCall[call.callId];
            const anotherActionIsPending = Object.entries(actionsByCall)
              .some(([id, currentAction]) => id !== call.callId && Boolean(currentAction));
            const busy = !connected || Boolean(action) || Boolean(activeCall) || Boolean(acceptingCallId) || anotherActionIsPending;
            return (
              <article className="global-call-card glass" key={call.callId}>
                <div className="global-call-heading">
                  <div className="global-ringing-label"><span /> RINGING</div>
                  <span className="global-call-service" title={connected ? "Call service connected" : "Reconnecting"}>
                    {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
                  </span>
                </div>
                <h2>{call.customerName}</h2>
                <p>Incoming browser voice call</p>
                <div className="global-call-actions">
                  <button className="global-accept-button" onClick={() => acceptCall(call.callId)} disabled={busy}>
                    <Phone size={16} /> {action === "accepting" ? "Accepting…" : "Accept"}
                  </button>
                  <button className="global-reject-button" onClick={() => rejectCall(call.callId)} disabled={busy}>
                    <PhoneOff size={16} /> {action === "rejecting" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {serviceError && activePage !== "Incoming" && (
        <div className="global-call-message" role="status">
          <span>{serviceError}</span>
          <button aria-label="Dismiss message" onClick={clearServiceError}><X size={15} /></button>
        </div>
      )}

      {activeCall && (
        <section className="global-active-call glass" aria-label="Active call">
          <div className="global-active-call-heading">
            <div>
              <span className="global-active-label">LIVE CALL</span>
              <h2>{activeCall.customerName}</h2>
            </div>
          </div>
          <VoiceCall
            roomName={activeCall.roomName}
            participantName="Call Centre Agent"
            onConnected={() => socketRef.current?.emit("call-audio-connected", { callId: activeCall.callId })}
            onCallEnded={() => socketRef.current?.emit("call-ended", { callId: activeCall.callId })}
            onCallFailed={() => socketRef.current?.emit("call-audio-failed", { callId: activeCall.callId })}
            onLeave={leaveActiveCall}
          />
        </section>
      )}
    </aside>
  );
}
