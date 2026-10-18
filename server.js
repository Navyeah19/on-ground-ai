
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5175"],
  },
});
const pendingCalls = new Map();
const registeredAgents = new Set();
const CALL_TIMEOUT_MS = 60_000;

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5175"] }));
app.use(express.json());

// Local-development-only token endpoint. Add authentication and authorization before deployment.
app.post("/get-token", async (req, res) => {
  try {
    const { roomName, participantName } = req.body;

    if (
      typeof roomName !== "string" ||
      !roomName.trim() ||
      typeof participantName !== "string" ||
      !participantName.trim()
    ) {
      return res.status(400).json({
        error: "Room name and participant name are required",
      });
    }

    if (
      !process.env.LIVEKIT_API_KEY ||
      !process.env.LIVEKIT_API_SECRET ||
      !process.env.LIVEKIT_URL
    ) {
      return res.status(500).json({
        error: "LiveKit credentials are not configured",
      });
    }

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: `${participantName}-${crypto.randomUUID()}`,
        name: participantName,
        ttl: "1h",
      }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    res.json({
      token: jwt,
      serverUrl: process.env.LIVEKIT_URL,
    });
  } catch {
    res.status(500).json({
      error: "Could not generate access token",
    });
  }
});
app.get("/", (req, res) => {
  res.send("On-Ground.ai LiveKit Backend Running Successfully!");
});

function emitCallError(socket, message, callId) {
  socket.emit("call-error", { message, ...(callId ? { callId } : {}) });
}

function resolvePendingCall(call, resolution) {
  clearTimeout(call.expirationTimer);
  pendingCalls.delete(call.callId);
  io.to("agents").emit("call-resolved", {
    callId: call.callId,
    customerName: call.customerName,
    ...resolution,
  });
}

io.on("connection", (socket) => {
  socket.on("register-agent", () => {
    registeredAgents.add(socket.id);
    socket.join("agents");
    socket.emit("agent-registered", { registered: true });
  });

  socket.on("incoming-call", (payload) => {
    const customerName = payload?.customerName;
    if (typeof customerName !== "string" || !customerName.trim() || customerName.trim().length > 100) {
      emitCallError(socket, "A customer name between 1 and 100 characters is required.");
      return;
    }

    const callId = randomUUID();
    const call = {
      callId,
      roomName: `incoming-${callId}`,
      customerName: customerName.trim(),
      callerSocketId: socket.id,
      expirationTimer: null,
    };
    call.expirationTimer = setTimeout(() => {
      if (pendingCalls.get(callId) !== call) return;
      resolvePendingCall(call, { status: "expired" });
      io.to(call.callerSocketId).emit("call-expired", { callId });
    }, CALL_TIMEOUT_MS);
    call.expirationTimer.unref?.();

    pendingCalls.set(callId, call);
    io.to("agents").emit("incoming-call", {
      callId,
      customerName: call.customerName,
      roomName: call.roomName,
    });
    socket.emit("call-requested", {
      callId,
      roomName: call.roomName,
      expiresInMs: CALL_TIMEOUT_MS,
    });
  });

  socket.on("accept-call", (payload) => {
    const callId = payload?.callId;
    if (!registeredAgents.has(socket.id)) {
      emitCallError(socket, "Register as an agent before accepting calls.");
      return;
    }
    if (typeof callId !== "string" || !callId.trim()) {
      emitCallError(socket, "A valid call ID is required.");
      return;
    }

    const call = pendingCalls.get(callId);
    if (!call) {
      emitCallError(socket, "This call is no longer available.");
      return;
    }

    // Map removal happens synchronously before notifying any sockets, so only one agent can win.
    clearTimeout(call.expirationTimer);
    pendingCalls.delete(callId);
    const acceptedCall = {
      callId: call.callId,
      customerName: call.customerName,
      roomName: call.roomName,
      agentId: socket.id,
    };
    io.to(call.callerSocketId).emit("call-accepted", acceptedCall);
    socket.emit("call-accepted", acceptedCall);
    io.to("agents").except(socket.id).emit("call-resolved", {
      callId: call.callId,
      customerName: call.customerName,
      status: "accepted",
      agentId: socket.id,
    });
  });

  socket.on("reject-call", (payload) => {
    const callId = payload?.callId;
    if (!registeredAgents.has(socket.id)) {
      emitCallError(socket, "Register as an agent before rejecting calls.");
      return;
    }
    if (typeof callId !== "string" || !callId.trim()) {
      emitCallError(socket, "A valid call ID is required.");
      return;
    }

    const call = pendingCalls.get(callId);
    if (!call) {
      emitCallError(socket, "This call is no longer available.");
      return;
    }

    resolvePendingCall(call, { status: "rejected", agentId: socket.id });
    io.to(call.callerSocketId).emit("call-rejected", { callId: call.callId });
  });

  socket.on("cancel-call", (payload) => {
    const callId = payload?.callId;
    if (typeof callId !== "string" || !callId.trim()) {
      emitCallError(socket, "A valid call ID is required to cancel a call.");
      return;
    }

    const call = pendingCalls.get(callId);
    if (!call || call.callerSocketId !== socket.id) {
      emitCallError(socket, "This call can no longer be cancelled.", callId);
      return;
    }

    resolvePendingCall(call, { status: "cancelled" });
    socket.emit("call-cancelled", { callId: call.callId });
  });

  socket.on("disconnect", () => {
    registeredAgents.delete(socket.id);
    for (const call of pendingCalls.values()) {
      if (call.callerSocketId !== socket.id) continue;
      resolvePendingCall(call, { status: "caller-disconnected" });
    }
  });
});

httpServer.listen(3001, "127.0.0.1", () => {
  console.log("LiveKit backend running at http://localhost:3001");
});
