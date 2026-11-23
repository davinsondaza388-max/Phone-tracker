
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json({ limit: "30kb" }));

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.get("/", (req, res) => {
  res.json({
    app: "Phone Tracker",
    status: "online",
    version: "1.1"
  });
});

app.post("/api/create", (req, res) => {
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();

  rooms.set(code, {
    devices: [],
    deviceInfo: {},
    locations: {}
  });

  res.json({ success: true, code });
});

app.post("/api/join", (req, res) => {
  const { code, deviceId, deviceInfo } = req.body;
  const room = rooms.get(String(code || "").toUpperCase());

  if (!room || typeof deviceId !== "string" || !deviceId) {
    return res.status(400).json({
      success: false,
      message: "Código o dispositivo inválido"
    });
  }

  if (!room.devices.includes(deviceId)) {
    if (room.devices.length >= 2) {
      return res.status(403).json({
        success: false,
        message: "El grupo ya tiene dos dispositivos"
      });
    }

    room.devices.push(deviceId);
  }

  if (deviceInfo && typeof deviceInfo === "object") {
    const clean = {};
    const allowed = [
      "deviceName",
      "model",
      "system",
      "browser",
      "screen",
      "language"
    ];

    for (const key of allowed) {
      if (typeof deviceInfo[key] === "string") {
        clean[key] = deviceInfo[key].slice(0, 100);
      }
    }

    room.deviceInfo[deviceId] = clean;
  }

  res.json({ success: true });
});

app.post("/api/location", (req, res) => {
  const {
    code,
    deviceId,
    latitude,
    longitude,
    accuracy
  } = req.body;

  const room = rooms.get(String(code || "").toUpperCase());

  if (!room || !room.devices.includes(deviceId)) {
    return res.status(403).json({ success: false });
  }

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({ success: false });
  }

  room.locations[deviceId] = {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    updatedAt: Date.now()
  };

  res.json({ success: true });
});

app.get("/api/location/:code", (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());

  if (!room) {
    return res.status(404).json({ success: false });
  }

  res.json({
    success: true,
    locations: room.locations,
    devices: room.deviceInfo
  });
});

app.post("/api/stop", (req, res) => {
  const { code, deviceId } = req.body;
  const room = rooms.get(String(code || "").toUpperCase());

  if (!room || !room.devices.includes(deviceId)) {
    return res.status(403).json({ success: false });
  }

  delete room.locations[deviceId];

  res.json({ success: true });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Phone Tracker activo en puerto ${PORT}`);
});
  
