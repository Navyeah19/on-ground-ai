import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Phone, PhoneOff, Wifi, WifiOff } from "lucide-react";
import { io } from "socket.io-client";
import VoiceCall from "./VoiceCall";
import "./CustomerCall.css";

function CustomerCall() {
  const [customerName, setCustomerName] = useState("");
  const [phase, setPhase] = useState("idle");
  const [serviceConnected, setServiceConnected] = useState(false);
  const [error, setError] = useState("");
  const [activeCall, setActiveCall] = useState(null);
  const socketRef = useRef(null);
  const callIdRef = useRef(null);
  const requestNameRef = useRef("");
  const requestPendingRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const activeCallRef = useRef(null);
  const earlyAcceptancesRef = useRef(new Map());
  const earlyResolutionsRef = useRef(new Map());

  useEffect(() => {
    const socket = io("http://localhost:3001", {
      autoConnect: false,
      forceNew: true,
    });
    socketRef.current = socket;

    function finishWithResolution(callId, type) {
      if (!requestPendingRef.current) return;
      if (!callIdRef.current) {
        earlyResolutionsRef.current.set(callId, type);
        return;
      }
      if (callIdRef.current !== callId) return;

      requestPendingRef.current = false;
      cancelRequestedRef.current = false;
      callIdRef.current = null;
      setPhase(type);
    }

    function activateAcceptedCall(payload) {
      if (!requestPendingRef.current || callIdRef.current !== payload.callId) return;

      if (cancelRequestedRef.current) {
        requestPendingRef.current = false;
        cancelRequestedRef.current = false;
        callIdRef.current = null;
        setPhase("cancelled");
        setError("The agent accepted as cancellation was sent. No audio connection was started.");
        return;
      }

      requestPendingRef.current = false;
      callIdRef.current = null;
      setError("");
      setPhase("accepted");
      const acceptedCall = {
        roomName: payload.roomName,
        participantName: requestNameRef.current,
        callId: payload.callId,
      };
      activeCallRef.current = acceptedCall;
      setActiveCall(acceptedCall);
    }

    function handleConnect() {
      setServiceConnected(true);
      setError("");
    }

    function handleDisconnect() {
      setServiceConnected(false);
      if (requestPendingRef.current) {
        requestPendingRef.current = false;
        cancelRequestedRef.current = false;
        callIdRef.current = null;
        setPhase("error");
        setError("Connection to the call service was lost. The pending call ended; please try again.");
      }
    }

    function handleConnectError() {
      setServiceConnected(false);
      if (requestPendingRef.current) {
        requestPendingRef.current = false;
        cancelRequestedRef.current = false;
        callIdRef.current = null;
        setPhase("error");
      }
      setError("Could not connect to the call service. Check that the local backend is running.");
    }

    function handleCallRequested(payload) {
      console.info("[customer-call] call-requested event received");
      if (!requestPendingRef.current || typeof payload?.callId !== "string" || !payload.callId) return;
      if (callIdRef.current && callIdRef.current !== payload.callId) return;

      callIdRef.current = payload.callId;
      if (cancelRequestedRef.current) {
        setPhase("cancelling");
        socket.emit("cancel-call", { callId: payload.callId });
        return;
      }

      const resolution = earlyResolutionsRef.current.get(payload.callId);
      if (resolution) {
        earlyResolutionsRef.current.delete(payload.callId);
        finishWithResolution(payload.callId, resolution);
        return;
      }

      setPhase("ringing");
      const earlyAcceptance = earlyAcceptancesRef.current.get(payload.callId);
      if (earlyAcceptance) {
        earlyAcceptancesRef.current.delete(payload.callId);
        activateAcceptedCall(earlyAcceptance);
      }
    }

    function handleCallAccepted(payload) {
      if (
        typeof payload?.callId !== "string" ||
        typeof payload.roomName !== "string" ||
        !payload.roomName
      ) {
        return;
      }
      if (!requestPendingRef.current) return;
      if (!callIdRef.current) {
        earlyAcceptancesRef.current.set(payload.callId, payload);
        return;
      }
      activateAcceptedCall(payload);
    }

    function handleCallRejected(payload) {
      if (typeof payload?.callId === "string") {
        finishWithResolution(payload.callId, "rejected");
      }
    }

    function handleCallExpired(payload) {
      if (typeof payload?.callId === "string") {
        finishWithResolution(payload.callId, "expired");
      }
    }

    function handleCallCancelled(payload) {
      if (typeof payload?.callId === "string") {
        finishWithResolution(payload.callId, "cancelled");
      }
    }

    function handleCallError(payload) {
      console.warn("[customer-call] call-error event received");
      if (payload?.callId && callIdRef.current && payload.callId !== callIdRef.current) return;
      if (!requestPendingRef.current) return;

      requestPendingRef.current = false;
      callIdRef.current = null;
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false;
        setPhase("cancelled");
        setError("The call was already resolved as cancellation was sent. No audio connection was started.");
        return;
      }
      setPhase("error");
      setError(payload?.message || "The call could not be processed.");
    }

    function handleRemoteCallEnded(payload) {
      if (activeCallRef.current?.callId !== payload?.callId) return;
      activeCallRef.current = null;
      setActiveCall(null);
      setPhase("ended");
      setError("The agent ended the call.");
    }

    function handleCallAudioTimeout(payload) {
      if (activeCallRef.current?.callId !== payload?.callId) return;
      activeCallRef.current = null;
      setActiveCall(null);
      setPhase("error");
      setError("The call could not establish LiveKit audio. Please try again.");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("call-requested", handleCallRequested);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("call-rejected", handleCallRejected);
    socket.on("call-expired", handleCallExpired);
    socket.on("call-cancelled", handleCallCancelled);
    socket.on("call-error", handleCallError);
    socket.on("call-remote-ended", handleRemoteCallEnded);
    socket.on("call-audio-timeout", handleCallAudioTimeout);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("call-requested", handleCallRequested);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("call-rejected", handleCallRejected);
      socket.off("call-expired", handleCallExpired);
      socket.off("call-cancelled", handleCallCancelled);
      socket.off("call-error", handleCallError);
      socket.off("call-remote-ended", handleRemoteCallEnded);
      socket.off("call-audio-timeout", handleCallAudioTimeout);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, []);

  function startCall(event) {
    event.preventDefault();
    const name = customerName.trim();
    const socket = socketRef.current;
    if (!name || !socket?.connected || requestPendingRef.current || activeCall) return;

    requestPendingRef.current = true;
    cancelRequestedRef.current = false;
    callIdRef.current = null;
    requestNameRef.current = name;
    earlyAcceptancesRef.current.clear();
    earlyResolutionsRef.current.clear();
    setError("");
    setPhase("requesting");
    console.info("[customer-call] emitting incoming-call");
    socket.emit("incoming-call", { customerName: name });
  }

  function cancelCall() {
    if (!requestPendingRef.current || cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setPhase("cancelling");
    setError("");
    const socket = socketRef.current;
    if (callIdRef.current && socket?.connected) {
      socket.emit("cancel-call", { callId: callIdRef.current });
    }
  }

  function endCall() {
    activeCallRef.current = null;
    setActiveCall(null);
    setPhase("ended");
  }

  const phaseText = {
    idle: "Ready to contact the call centre.",
    requesting: "Sending call request…",
    ringing: "Calling agent…",
    cancelling: "Cancelling call…",
    cancelled: "Call cancelled.",
    rejected: "Call rejected.",
    expired: "No agent answered before the call expired.",
    error: "The call request could not be completed.",
    accepted: "Agent accepted. Connecting to the voice room…",
    ended: "Call ended.",
  }[phase];

  const waiting = phase === "requesting" || phase === "ringing" || phase === "cancelling";

  return (
    <main className="customer-call-page">
      <section className="customer-call-card glass">
        <div className="customer-call-brand">
          <div className="customer-call-brand-icon">O.</div>
          <div>
            <strong>On-Ground.ai</strong>
            <span>CALL CENTRE</span>
          </div>
        </div>

        <p className="eyebrow">CUSTOMER SUPPORT</p>
        <h1>Contact Call Centre</h1>
        <p className="customer-call-intro">Speak directly with a call centre agent using your browser.</p>

        <div className={`customer-service-status ${serviceConnected ? "is-connected" : ""}`} role="status">
          {serviceConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
          {serviceConnected ? "Call service connected" : "Connecting to call service…"}
        </div>

        {!activeCall ? (
          <form className="customer-call-form" onSubmit={startCall}>
            <label htmlFor="customer-name">Your name</label>
            <input
              id="customer-name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Enter your name"
              maxLength={100}
              autoComplete="name"
              disabled={waiting}
              required
            />

            {!(phase === "error" && error) && (
              <div className={`customer-call-status phase-${phase}`} aria-live="polite">
                {waiting && <LoaderCircle className="customer-status-spinner" size={17} />}
                <span>{phaseText}</span>
              </div>
            )}
            {error && <p className="customer-call-error" role="alert">{error}</p>}

            <div className="customer-call-actions">
              <button
                className="customer-start-button"
                type="submit"
                disabled={!serviceConnected || waiting || Boolean(activeCall) || !customerName.trim()}
              >
                <Phone size={18} /> Call Agent
              </button>
              {waiting && (
                <button
                  className="customer-cancel-button"
                  type="button"
                  onClick={cancelCall}
                  disabled={phase === "cancelling"}
                >
                  <PhoneOff size={17} />
                  {phase === "cancelling" ? "Cancelling…" : "Cancel Call"}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="customer-live-call">
            <div className="customer-call-status phase-accepted" aria-live="polite">
              Agent accepted. Connecting to the voice room…
            </div>
            <VoiceCall
              roomName={activeCall.roomName}
              participantName={activeCall.participantName}
              onConnected={() => socketRef.current?.emit("call-audio-connected", { callId: activeCall.callId })}
              onCallEnded={() => socketRef.current?.emit("call-ended", { callId: activeCall.callId })}
              onCallFailed={() => socketRef.current?.emit("call-audio-failed", { callId: activeCall.callId })}
              onLeave={endCall}
            />
          </div>
        )}

        <p className="customer-call-footnote">This is a browser voice call. No telephone call will be placed.</p>
      </section>
    </main>
  );
}

export default CustomerCall;
