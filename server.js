
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
const activeCalls = new Map();
const registeredAgents = new Set();
const resolvingCalls = new Set();
const acceptingCalls = new Set();
const endingCalls = new Set();
const CALL_TIMEOUT_MS = 60_000;
const AUDIO_CONNECT_TIMEOUT_MS = 45_000;
const CALLS_FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "calls.json");
const SCHEDULED_CALLS_FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "scheduled-calls.json");
const LEADS_FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "leads.json");
let callHistory = [];
let callHistoryWriteQueue = Promise.resolve();
let scheduledCalls = [];
let scheduledCallsWriteQueue = Promise.resolve();
let leads = [];
let leadsWriteQueue = Promise.resolve();

function loadCallHistory() {
  return readFile(CALLS_FILE, "utf8").then((json) => {
    const records = JSON.parse(json);
    if (!Array.isArray(records)) throw new Error("Invalid call history format");
    callHistory = records;
  }).catch((error) => {
    if (error.code === "ENOENT") {
      callHistory = [];
      return;
    }
    throw error;
  });
}

async function writeCallHistorySnapshot(records) {
  const snapshot = JSON.stringify(records, null, 2);
  await (async () => {
    await mkdir(dirname(CALLS_FILE), { recursive: true });
    // Use a per-write temporary file. This avoids stale temp-file collisions if a
    // prior write was interrupted and still lets rename replace the JSON atomically.
    const temporaryFile = `${CALLS_FILE}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryFile, snapshot, { encoding: "utf8", flag: "wx" });
      await rename(temporaryFile, CALLS_FILE);
    } catch (error) {
      await unlink(temporaryFile).catch(() => {});
      throw error;
    }
  })();
}

async function loadScheduledCalls() {
  try {
    const json = await readFile(SCHEDULED_CALLS_FILE, "utf8");
    const records = JSON.parse(json);
    if (!Array.isArray(records)) throw new Error("Invalid scheduled calls format");
    scheduledCalls = records;
  } catch (error) {
    if (error.code === "ENOENT") {
      scheduledCalls = [];
      return;
    }
    throw error;
  }
}

async function loadLeads() {
  try {
    const json = await readFile(LEADS_FILE, "utf8");
    const records = JSON.parse(json);
    if (!Array.isArray(records)) throw new Error("Invalid leads format");
    leads = records;
  } catch (error) {
    if (error.code === "ENOENT") {
      leads = [];
      return;
    }
    throw error;
  }
}

async function writeLeadsSnapshot(records) {
  const snapshot = JSON.stringify(records, null, 2);
  await mkdir(dirname(LEADS_FILE), { recursive: true });
  const temporaryFile = `${LEADS_FILE}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, snapshot, { encoding: "utf8", flag: "wx" });
    await rename(temporaryFile, LEADS_FILE);
  } catch (error) {
    await unlink(temporaryFile).catch(() => {});
    throw error;
  }
}

function mutateLeads(mutator) {
  const operation = leadsWriteQueue.catch(() => {}).then(async () => {
    const next = leads.map((lead) => ({ ...lead }));
    const result = mutator(next);
    if (!result.changed) return result.value;
    await writeLeadsSnapshot(next);
    leads = next;
    return result.value;
  });
  leadsWriteQueue = operation;
  return operation;
}

function validLeadFields(fields) {
  if (!fields || typeof fields !== "object") return false;
  const { customerName, phoneNumber, email, status, priority, notes } = fields;
  const validStatuses = ["New", "Contacted", "Interested", "Follow-up", "Converted", "Lost"];
  const validPriorities = ["High", "Medium", "Low"];
  const normalizedEmail = typeof email === "string" ? email.trim() : "";
  const validScore = (score) => score === undefined || score === null || (Number.isInteger(score) && score >= 0 && score <= 100);
  const validBuyingSignals = fields.buyingSignals === undefined || (
    Array.isArray(fields.buyingSignals) &&
    fields.buyingSignals.length <= 20 &&
    fields.buyingSignals.every((signal) => typeof signal === "string" && signal.trim().length > 0 && signal.trim().length <= 240)
  );
  const lastContactedAt = fields.lastContactedAt ?? "";
  const validLastContacted = typeof lastContactedAt === "string" && (!lastContactedAt || (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastContactedAt)) return false;
    const [year, month, day] = lastContactedAt.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  })());
  return typeof customerName === "string" && customerName.trim().length > 0 && customerName.trim().length <= 120 &&
    typeof phoneNumber === "string" && /^[+\d().\-\s]{5,30}$/.test(phoneNumber.trim()) &&
    normalizedEmail.length <= 254 && (!normalizedEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) &&
    validStatuses.includes(status) && validPriorities.includes(priority) && validLastContacted &&
    validScore(fields.icpScore) && validScore(fields.intentScore) && validBuyingSignals &&
    typeof notes === "string" && notes.length <= 5000;
}

function reportLeadPersistenceFailure(error) {
  console.error(`[leads] persistence failed (${error.code || error.name || "unknown error"})`);
}

async function writeScheduledCallsSnapshot(records) {
  const snapshot = JSON.stringify(records, null, 2);
  await mkdir(dirname(SCHEDULED_CALLS_FILE), { recursive: true });
  const temporaryFile = `${SCHEDULED_CALLS_FILE}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFile, snapshot, { encoding: "utf8", flag: "wx" });
    await rename(temporaryFile, SCHEDULED_CALLS_FILE);
  } catch (error) {
    await unlink(temporaryFile).catch(() => {});
    throw error;
  }
}

function mutateScheduledCalls(mutator) {
  const operation = scheduledCallsWriteQueue.catch(() => {}).then(async () => {
    const next = scheduledCalls.map((call) => ({ ...call }));
    const result = mutator(next);
    if (!result.changed) return result.value;
    await writeScheduledCallsSnapshot(next);
    scheduledCalls = next;
    return result.value;
  });
  scheduledCallsWriteQueue = operation;
  return operation;
}

function validScheduleFields(fields) {
  if (
    !fields ||
    typeof fields.customerName !== "string" ||
    !fields.customerName.trim() ||
    fields.customerName.trim().length > 100 ||
    typeof fields.phoneNumber !== "string" ||
    !/^[+\d().\-\s]{5,30}$/.test(fields.phoneNumber.trim()) ||
    typeof fields.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.date) ||
    typeof fields.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.time) ||
    typeof fields.notes !== "string" ||
    fields.notes.length > 2000
  ) return false;

  const [year, month, day] = fields.date.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  return parsedDate.getFullYear() === year && parsedDate.getMonth() === month - 1 && parsedDate.getDate() === day;
}

function reportPersistenceFailure(error) {
  // Diagnostics intentionally omit record contents, customer data, and credentials.
  console.error(`[call-history] persistence failed (${error.code || error.name || "unknown error"})`);
}

function persistCallHistory() {
  const write = callHistoryWriteQueue.catch(() => {}).then(() => writeCallHistorySnapshot(callHistory));
  callHistoryWriteQueue = write;
  return write.then(() => {
    console.info("[call-history] persistence succeeded");
    return true;
  }).catch((error) => {
    reportPersistenceFailure(error);
    return false;
  });
}

function findCallRecord(callId) {
  return callHistory.find((record) => record.callId === callId);
}

function mutateCallHistory(mutator) {
  const operation = callHistoryWriteQueue.catch(() => {}).then(async () => {
    // Apply changes to a private snapshot and publish it in memory only after the
    // same snapshot is safely written. Failed records cannot leak into later saves.
    const nextHistory = callHistory.map((record) => ({ ...record }));
    const result = mutator(nextHistory);
    if (!result.changed) return result.value;
    await writeCallHistorySnapshot(nextHistory);
    callHistory = nextHistory;
    console.info("[call-history] persistence succeeded");
    return result.value;
  });
  callHistoryWriteQueue = operation;
  return operation.catch((error) => {
    reportPersistenceFailure(error);
    return false;
  });
}

async function addCallRecord(record) {
  return mutateCallHistory((records) => {
    if (records.some((saved) => saved.callId === record.callId)) {
      return { changed: false, value: true };
    }
    records.unshift(record);
    return { changed: true, value: true };
  });
}

async function updateCallRecord(callId, update) {
  return mutateCallHistory((records) => {
    const record = records.find((saved) => saved.callId === callId);
    if (!record) return { changed: false, value: false };
    Object.assign(record, update);
    return { changed: true, value: true };
  });
}

async function finishCallRecord(callId, statusWithoutAudio) {
  const record = findCallRecord(callId);
  if (!record || record.endedAt) return true;
  const endedAt = new Date().toISOString();
  if (record.connectedAt) {
    const elapsed = Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(record.connectedAt)) / 1000));
    return updateCallRecord(callId, {
      status: "Answered",
      endedAt,
      durationSeconds: elapsed,
    });
  }
  return updateCallRecord(callId, {
    status: statusWithoutAudio,
    endedAt,
    durationSeconds: null,
  });
}

function validateCallId(callId) {
  return typeof callId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(callId);
}

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5175"] }));
app.use(express.json());

// Local-only call history APIs. The server binds to loopback; do not expose these unauthenticated routes publicly.
app.get("/api/scheduled-calls", (req, res) => {
  res.json({ calls: scheduledCalls });
});

app.post("/api/scheduled-calls", async (req, res) => {
  const fields = req.body || {};
  if (!validScheduleFields(fields)) {
    return res.status(400).json({ error: "Enter a valid customer name, phone number, date, time, and notes." });
  }

  const now = new Date().toISOString();
  const call = {
    id: randomUUID(),
    customerName: fields.customerName.trim(),
    phoneNumber: fields.phoneNumber.trim(),
    date: fields.date,
    time: fields.time,
    notes: fields.notes.trim(),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await mutateScheduledCalls((records) => {
      records.push(call);
      return { changed: true, value: call };
    });
    return res.status(201).json({ call });
  } catch (error) {
    reportPersistenceFailure(error);
    return res.status(500).json({ error: "Could not save the scheduled call." });
  }
});

app.put("/api/scheduled-calls/:id", async (req, res) => {
  const { id } = req.params;
  const fields = req.body || {};
  if (typeof id !== "string" || !validateCallId(id) || !validScheduleFields(fields)) {
    return res.status(400).json({ error: "Enter valid scheduled call details." });
  }

  try {
    const result = await mutateScheduledCalls((records) => {
      const call = records.find((record) => record.id === id);
      if (!call) return { changed: false, value: null };
      Object.assign(call, {
        customerName: fields.customerName.trim(),
        phoneNumber: fields.phoneNumber.trim(),
        date: fields.date,
        time: fields.time,
        notes: fields.notes.trim(),
        updatedAt: new Date().toISOString(),
      });
      return { changed: true, value: call };
    });
    if (!result) return res.status(404).json({ error: "Scheduled call was not found." });
    return res.json({ call: result });
  } catch (error) {
    reportPersistenceFailure(error);
    return res.status(500).json({ error: "Could not update the scheduled call." });
  }
});

app.delete("/api/scheduled-calls/:id", async (req, res) => {
  const { id } = req.params;
  if (typeof id !== "string" || !validateCallId(id)) {
    return res.status(400).json({ error: "Invalid scheduled call ID." });
  }

  try {
    const deleted = await mutateScheduledCalls((records) => {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return { changed: false, value: false };
      records.splice(index, 1);
      return { changed: true, value: true };
    });
    if (!deleted) return res.status(404).json({ error: "Scheduled call was not found." });
    return res.json({ deleted: true });
  } catch (error) {
    reportPersistenceFailure(error);
    return res.status(500).json({ error: "Could not delete the scheduled call." });
  }
});

// Local-development lead management. Records may contain customer contact details;
// keep this loopback-only API private until authentication is added.
app.get("/api/leads", (req, res) => {
  res.json({ leads });
});

app.post("/api/leads", async (req, res) => {
  const fields = req.body || {};
  if (!validLeadFields(fields)) {
    return res.status(400).json({ error: "Enter a valid name, phone number, email, status, priority, and notes." });
  }

  const timestamp = new Date().toISOString();
  const lead = {
    id: randomUUID(),
    customerName: fields.customerName.trim(),
    phoneNumber: fields.phoneNumber.trim(),
    email: fields.email.trim(),
    status: fields.status,
    priority: fields.priority,
    icpScore: fields.icpScore ?? null,
    intentScore: fields.intentScore ?? null,
    buyingSignals: Array.isArray(fields.buyingSignals) ? fields.buyingSignals.map((signal) => signal.trim()) : [],
    lastContactedAt: fields.lastContactedAt || null,
    notes: fields.notes.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  try {
    await mutateLeads((records) => {
      records.unshift(lead);
      return { changed: true, value: lead };
    });
    return res.status(201).json({ lead });
  } catch (error) {
    reportLeadPersistenceFailure(error);
    return res.status(500).json({ error: "Could not save the lead." });
  }
});

app.put("/api/leads/:id", async (req, res) => {
  const { id } = req.params;
  const fields = req.body || {};
  if (!validateCallId(id) || !validLeadFields(fields)) {
    return res.status(400).json({ error: "Enter valid lead details." });
  }

  try {
    const updated = await mutateLeads((records) => {
      const lead = records.find((record) => record.id === id);
      if (!lead) return { changed: false, value: null };
      Object.assign(lead, {
        customerName: fields.customerName.trim(),
        phoneNumber: fields.phoneNumber.trim(),
        email: fields.email.trim(),
        status: fields.status,
        priority: fields.priority,
        ...(Object.hasOwn(fields, "icpScore") ? { icpScore: fields.icpScore ?? null } : {}),
        ...(Object.hasOwn(fields, "intentScore") ? { intentScore: fields.intentScore ?? null } : {}),
        ...(Object.hasOwn(fields, "buyingSignals") ? { buyingSignals: fields.buyingSignals.map((signal) => signal.trim()) } : {}),
        lastContactedAt: fields.lastContactedAt || null,
        notes: fields.notes.trim(),
        updatedAt: new Date().toISOString(),
      });
      return { changed: true, value: lead };
    });
    if (!updated) return res.status(404).json({ error: "Lead was not found." });
    return res.json({ lead: updated });
  } catch (error) {
    reportLeadPersistenceFailure(error);
    return res.status(500).json({ error: "Could not update the lead." });
  }
});

app.delete("/api/leads/:id", async (req, res) => {
  const { id } = req.params;
  if (!validateCallId(id)) return res.status(400).json({ error: "Invalid lead ID." });
  try {
    const deleted = await mutateLeads((records) => {
      const index = records.findIndex((lead) => lead.id === id);
      if (index < 0) return { changed: false, value: false };
      records.splice(index, 1);
      return { changed: true, value: true };
    });
    if (!deleted) return res.status(404).json({ error: "Lead was not found." });
    return res.json({ deleted: true });
  } catch (error) {
    reportLeadPersistenceFailure(error);
    return res.status(500).json({ error: "Could not delete the lead." });
  }
});

app.get("/api/calls", (req, res) => {
  res.json({ calls: callHistory });
});

app.post("/api/calls", async (req, res) => {
  const { callId, customerName, roomName } = req.body || {};
  if (
    !validateCallId(callId) ||
    typeof customerName !== "string" ||
    !customerName.trim() ||
    customerName.trim().length > 100 ||
    typeof roomName !== "string" ||
    !roomName.trim() ||
    roomName.trim().length > 200
  ) {
    return res.status(400).json({ error: "Valid call ID, customer name, and room name are required." });
  }

  const existing = findCallRecord(callId);
  if (existing) {
    if (existing.callType !== "Outgoing" || existing.roomName !== roomName.trim()) {
      return res.status(409).json({ error: "This call ID is already in use." });
    }
    return res.json({ call: existing });
  }

  const call = {
    callId,
    customerName: customerName.trim(),
    callType: "Outgoing",
    roomName: roomName.trim(),
    startedAt: new Date().toISOString(),
    connectedAt: null,
    endedAt: null,
    durationSeconds: null,
    status: "Ringing",
  };
  const saved = await addCallRecord(call);
  if (!saved) return res.status(500).json({ error: "Could not save call history." });
  return res.status(201).json({ call });
});

app.post("/api/calls/:callId/events", async (req, res) => {
  const { callId } = req.params;
  const { event } = req.body || {};
  if (!validateCallId(callId) || !["audio-connected", "ended", "failed"].includes(event)) {
    return res.status(400).json({ error: "Invalid call event." });
  }

  const call = findCallRecord(callId);
  if (!call || call.callType !== "Outgoing") {
    return res.status(404).json({ error: "Outgoing call was not found." });
  }

  if (event === "audio-connected") {
    if (!call.endedAt && !["Rejected", "Missed", "Cancelled"].includes(call.status)) {
      const connectedAt = call.connectedAt || new Date().toISOString();
      const saved = await updateCallRecord(callId, { connectedAt, status: "Answered" });
      if (!saved) return res.status(500).json({ error: "Could not save call history." });
    }
  } else if (event === "ended") {
    const saved = await finishCallRecord(callId, "Cancelled");
    if (!saved) return res.status(500).json({ error: "Could not save call history." });
  } else if (!call.connectedAt && !call.endedAt) {
    const saved = await finishCallRecord(callId, "Missed");
    if (!saved) return res.status(500).json({ error: "Could not save call history." });
  }

  return res.json({ call });
});

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
  console.info("[socket] emitted call-error");
}

async function resolvePendingCall(call, resolution) {
  if (
    pendingCalls.get(call.callId) !== call ||
    resolvingCalls.has(call.callId) ||
    acceptingCalls.has(call.callId)
  ) return false;
  resolvingCalls.add(call.callId);
  const status = {
    rejected: "Rejected",
    cancelled: "Cancelled",
    expired: "Missed",
    "caller-disconnected": "Cancelled",
  }[resolution.status] || "Missed";
  const saved = await finishCallRecord(call.callId, status);
  if (!saved) {
    resolvingCalls.delete(call.callId);
    if (resolution.status === "expired" && pendingCalls.get(call.callId) === call) {
      call.expirationTimer = setTimeout(() => {
        void resolvePendingCall(call, resolution).then((resolved) => {
          if (resolved) io.to(call.callerSocketId).emit("call-expired", { callId: call.callId });
        });
      }, 5_000);
      call.expirationTimer.unref?.();
    }
    return false;
  }
  if (pendingCalls.get(call.callId) !== call) {
    resolvingCalls.delete(call.callId);
    return false;
  }
  clearTimeout(call.expirationTimer);
  pendingCalls.delete(call.callId);
  resolvingCalls.delete(call.callId);
  io.to("agents").emit("call-resolved", {
    callId: call.callId,
    customerName: call.customerName,
    ...resolution,
  });
  return true;
}

async function finishActiveCall(activeCall, notification = "call-remote-ended") {
  if (activeCalls.get(activeCall.callId) !== activeCall || endingCalls.has(activeCall.callId)) return false;
  endingCalls.add(activeCall.callId);
  const saved = await finishCallRecord(activeCall.callId, "Missed");
  if (!saved) {
    endingCalls.delete(activeCall.callId);
    activeCall.audioConnectTimer = setTimeout(() => {
      void finishActiveCall(activeCall, notification);
    }, 5_000);
    activeCall.audioConnectTimer.unref?.();
    return false;
  }
  activeCalls.delete(activeCall.callId);
  clearTimeout(activeCall.audioConnectTimer);
  endingCalls.delete(activeCall.callId);

  const peers = [activeCall.callerSocketId, activeCall.agentSocketId].filter(
    (socketId) => socketId !== activeCall.endedBySocketId
  );
  for (const socketId of peers) {
    io.to(socketId).emit(notification, { callId: activeCall.callId });
  }
  return true;
}

io.on("connection", (socket) => {
  socket.on("register-agent", () => {
    registeredAgents.add(socket.id);
    socket.join("agents");
    socket.emit("agent-registered", { registered: true });
    // Replay calls still waiting for an agent so a reconnecting app does not miss them.
    for (const call of pendingCalls.values()) {
      socket.emit("incoming-call", {
        callId: call.callId,
        customerName: call.customerName,
        roomName: call.roomName,
      });
    }
  });

  socket.on("incoming-call", async (payload) => {
    console.info("[socket] incoming-call received");
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
    pendingCalls.set(callId, call);

    const record = {
      callId,
      customerName: call.customerName,
      callType: "Incoming",
      roomName: call.roomName,
      startedAt: new Date().toISOString(),
      acceptedAt: null,
      connectedAt: null,
      endedAt: null,
      durationSeconds: null,
      status: "Ringing",
    };
    const saved = await addCallRecord(record);
    if (!saved) {
      if (pendingCalls.get(callId) === call) pendingCalls.delete(callId);
      console.warn("[socket] emitting call-error after incoming-call persistence failure");
      emitCallError(socket, "Could not save this call. Please try again.", callId);
      return;
    }
    if (pendingCalls.get(callId) !== call) return;
    if (!socket.connected) {
      console.info("[socket] caller disconnected before call-requested; resolving as cancelled");
      await resolvePendingCall(call, { status: "caller-disconnected" });
      return;
    }

    call.expirationTimer = setTimeout(() => {
      void resolvePendingCall(call, { status: "expired" }).then((resolved) => {
        if (resolved) io.to(call.callerSocketId).emit("call-expired", { callId });
      });
    }, CALL_TIMEOUT_MS);
    call.expirationTimer.unref?.();

    io.to("agents").emit("incoming-call", {
      callId,
      customerName: call.customerName,
      roomName: call.roomName,
    });
    console.info("[socket] emitted incoming-call to agents");
    socket.emit("call-requested", {
      callId,
      roomName: call.roomName,
      expiresInMs: CALL_TIMEOUT_MS,
    });
    console.info("[socket] emitted call-requested to caller");
  });

  socket.on("accept-call", async (payload) => {
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

    if (acceptingCalls.has(callId) || resolvingCalls.has(callId)) {
      emitCallError(socket, "This call is already being handled.", callId);
      return;
    }
    acceptingCalls.add(callId);
    const saved = await updateCallRecord(callId, {
      status: "Connecting",
      acceptedAt: new Date().toISOString(),
    });
    acceptingCalls.delete(callId);
    if (!saved) {
      emitCallError(socket, "Could not save this call update. Please try again.", callId);
      return;
    }
    if (pendingCalls.get(callId) !== call) return;

    // Claim synchronously after the durable update so only one agent can win.
    clearTimeout(call.expirationTimer);
    pendingCalls.delete(callId);
    const activeCall = {
      callId: call.callId,
      customerName: call.customerName,
      roomName: call.roomName,
      callerSocketId: call.callerSocketId,
      agentSocketId: socket.id,
      audioConnectTimer: null,
    };
    activeCalls.set(callId, activeCall);

    activeCall.audioConnectTimer = setTimeout(() => {
      void finishActiveCall(activeCall, "call-audio-timeout");
    }, AUDIO_CONNECT_TIMEOUT_MS);
    activeCall.audioConnectTimer.unref?.();

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

  socket.on("reject-call", async (payload) => {
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

    const resolved = await resolvePendingCall(call, { status: "rejected", agentId: socket.id });
    if (!resolved) {
      emitCallError(socket, "Could not resolve this call. Please try again.", callId);
      return;
    }
    io.to(call.callerSocketId).emit("call-rejected", { callId: call.callId });
  });

  socket.on("cancel-call", async (payload) => {
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

    const resolved = await resolvePendingCall(call, { status: "cancelled" });
    if (!resolved) {
      emitCallError(socket, "Could not resolve this call. Please try again.", callId);
      return;
    }
    socket.emit("call-cancelled", { callId: call.callId });
  });

  socket.on("call-audio-connected", async (payload) => {
    const callId = payload?.callId;
    if (!validateCallId(callId)) return;
    const activeCall = activeCalls.get(callId);
    if (
      !activeCall ||
      (socket.id !== activeCall.callerSocketId && socket.id !== activeCall.agentSocketId)
    ) {
      return;
    }
    const record = findCallRecord(callId);
    if (!record || record.endedAt || record.connectedAt) return;

    const connectedAt = new Date().toISOString();
    const saved = await updateCallRecord(callId, { status: "Answered", connectedAt });
    if (saved) clearTimeout(activeCall.audioConnectTimer);
  });

  socket.on("call-audio-failed", (payload) => {
    const callId = payload?.callId;
    if (!validateCallId(callId)) return;
    const activeCall = activeCalls.get(callId);
    if (
      activeCall &&
      (socket.id === activeCall.callerSocketId || socket.id === activeCall.agentSocketId)
    ) {
      activeCall.endedBySocketId = socket.id;
      void finishActiveCall(activeCall, "call-audio-timeout");
    }
  });

  socket.on("call-ended", (payload) => {
    const callId = payload?.callId;
    if (!validateCallId(callId)) return;
    const activeCall = activeCalls.get(callId);
    if (
      activeCall &&
      (socket.id === activeCall.callerSocketId || socket.id === activeCall.agentSocketId)
    ) {
      activeCall.endedBySocketId = socket.id;
      void finishActiveCall(activeCall);
    }
  });

  socket.on("disconnect", () => {
    registeredAgents.delete(socket.id);
    for (const call of pendingCalls.values()) {
      if (call.callerSocketId !== socket.id) continue;
      void resolvePendingCall(call, { status: "caller-disconnected" });
    }
    for (const activeCall of activeCalls.values()) {
      if (activeCall.callerSocketId !== socket.id && activeCall.agentSocketId !== socket.id) continue;
      activeCall.endedBySocketId = socket.id;
      void finishActiveCall(activeCall);
    }
  });
});

await loadCallHistory();
await loadScheduledCalls();
await loadLeads();
const staleCalls = callHistory.filter((call) => ["Ringing", "Connecting"].includes(call.status));
if (staleCalls.length > 0) {
  const endedAt = new Date().toISOString();
  staleCalls.forEach((call) => {
    call.status = "Missed";
    call.endedAt = endedAt;
    call.durationSeconds = null;
  });
  await persistCallHistory();
}

httpServer.listen(3001, "127.0.0.1", () => {
  console.log("LiveKit backend running at http://localhost:3001");
});
