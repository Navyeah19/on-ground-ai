
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";

dotenv.config();

const app = express();

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
app.listen(3001, "127.0.0.1", () => {
  console.log("LiveKit backend running at http://localhost:3001");
});
