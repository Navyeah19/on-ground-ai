import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import { API_BASE_URL } from "./config";

function VoiceCall({
  roomName,
  participantName,
  onLeave,
  onConnected,
  onCallEnded,
  onCallFailed,
}) {
  const [status, setStatus] = useState("Connecting");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const roomRef = useRef(null);
  const audioContainerRef = useRef(null);
  const endedRef = useRef(false);
  const onLeaveRef = useRef(onLeave);
  const onConnectedRef = useRef(onConnected);
  const onCallEndedRef = useRef(onCallEnded);
  const onCallFailedRef = useRef(onCallFailed);
  const localMicReadyRef = useRef(false);
  const remoteAudioSubscribedRef = useRef(false);
  const joinedRoomRef = useRef(false);
  const reportedConnectedRef = useRef(false);
  const reportedEndedRef = useRef(false);
  const reportedFailedRef = useRef(false);

  useEffect(() => {
    onLeaveRef.current = onLeave;
    onConnectedRef.current = onConnected;
    onCallEndedRef.current = onCallEnded;
    onCallFailedRef.current = onCallFailed;
  }, [onLeave, onConnected, onCallEnded, onCallFailed]);

  function reportConnected() {
    if (reportedConnectedRef.current || !localMicReadyRef.current || !remoteAudioSubscribedRef.current) return;
    reportedConnectedRef.current = true;
    onConnectedRef.current?.();
  }

  function reportEnded() {
    if (reportedEndedRef.current || reportedFailedRef.current) return;
    reportedEndedRef.current = true;
    onCallEndedRef.current?.();
  }

  function reportFailed() {
    if (reportedFailedRef.current || reportedConnectedRef.current) return;
    reportedFailedRef.current = true;
    reportedEndedRef.current = true;
    onCallFailedRef.current?.();
  }

  useEffect(() => {
    const room = new Room();
    let cancelled = false;
    roomRef.current = room;

    const attachAudio = (track) => {
      if (track.kind !== Track.Kind.Audio || !audioContainerRef.current) return;
      const element = track.attach();
      element.autoplay = true;
      element.setAttribute("playsinline", "true");
      audioContainerRef.current.appendChild(element);
      element.play().catch(() => {});
    };
    const detachAudio = (track) => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((element) => element.remove());
    };
    const detachAllRemoteAudio = () => {
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (publication.track) detachAudio(publication.track);
        });
      });
    };
    const onSubscribed = (track) => {
      attachAudio(track);
      if (track.kind === Track.Kind.Audio) {
        remoteAudioSubscribedRef.current = true;
        if (localMicReadyRef.current) setStatus("Connected");
        reportConnected();
      }
    };
    const onUnsubscribed = (track) => {
      detachAudio(track);
      if (track.kind === Track.Kind.Audio) {
        remoteAudioSubscribedRef.current = false;
        setStatus("Waiting for participant");
      }
    };
    const onParticipantConnected = () => {
      if (remoteAudioSubscribedRef.current) setStatus("Connected");
    };
    const onParticipantDisconnected = () => setStatus("Waiting for participant");
    const onDisconnected = () => {
      detachAllRemoteAudio();
      setStatus("Disconnected");
      if (joinedRoomRef.current) reportEnded();
    };

    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    async function connect() {
      try {
        const response = await fetch(`${API_BASE_URL}/get-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName, participantName }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || "Could not get an access token.");
        }
        const { token, serverUrl } = await response.json();
        if (!token || !serverUrl) throw new Error("The call server returned incomplete connection details.");
        if (cancelled) return;

        await room.connect(serverUrl, token);
        joinedRoomRef.current = true;
        if (cancelled) {
          await room.disconnect();
          reportEnded();
          return;
        }

        // Enabling the microphone requests browser permission and publishes audio.
        await room.localParticipant.setMicrophoneEnabled(true);
        localMicReadyRef.current = true;
        if (cancelled) {
          await room.disconnect();
          reportEnded();
          return;
        }
        reportConnected();
        setReady(true);
        setStatus(remoteAudioSubscribedRef.current ? "Connected" : "Waiting for participant");
      } catch (callError) {
        if (cancelled) return;
        setStatus("Error");
        reportFailed();
        room.disconnect().catch(() => {});
        setError(
          callError?.name === "NotAllowedError" || callError?.name === "PermissionDeniedError"
            ? "Microphone access was denied. Allow microphone access in your browser and try again."
            : callError?.message || "Could not connect to the voice room."
        );
      }
    }

    connect();

    return () => {
      cancelled = true;
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      detachAllRemoteAudio();
      if (joinedRoomRef.current) reportEnded();
      room.disconnect().catch(() => {});
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [roomName, participantName]);

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(muted);
      setMuted(!muted);
    } catch (callError) {
      setStatus("Error");
      setError(callError?.message || "Could not change microphone state.");
    }
  }

  async function endCall() {
    if (endedRef.current) return;
    endedRef.current = true;
    reportEnded();
    try {
      await roomRef.current?.disconnect();
    } finally {
      onLeaveRef.current();
    }
  }

  return (
    <div className="voice-call">
      <div
        className={`voice-call-indicator ${status === "Connected" ? "is-connected" : ""}`}
        aria-live="polite"
      >
        <span className="voice-call-dot" />
        {status}
      </div>
      {error && <p className="voice-call-error" role="alert">{error}</p>}
      <div className="call-controls">
        <button
          className="mute-button"
          onClick={toggleMute}
          disabled={!ready || status === "Error"}
        >
          {muted ? <MicOff size={17} /> : <Mic size={17} />}
          {muted ? "Unmute" : "Mute"}
        </button>
        <button className="end-call-button" onClick={endCall}>
          <PhoneOff size={17} /> End Call
        </button>
      </div>
      <div className="remote-audio" ref={audioContainerRef} />
    </div>
  );
}

export default VoiceCall;
