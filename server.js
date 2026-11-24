
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json({ limit: "30kb" }));

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const deviceRooms = new Map();
const pendingRequests = new Map();

app.get("/", (req, res) => {
  res.json({
    app: "Phone Tracker",
    status: "online",
    version: "4.2"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

function validId(id) {
  return typeof id === "string" &&
    /^PT-[a-zA-Z0-9-]{10,150}$/.test(id);
}

function cleanName(name) {
  if (typeof name !== "string") return "Dispositivo";
  return name.trim().slice(0, 35) || "Dispositivo";
}

function getRoom(code) {
  return rooms.get(String(code || "").toUpperCase());
}

app.post("/api/register", (req, res) => {
  const { deviceId, deviceInfo, name } = req.body;

  if (!validId(deviceId)) {
    return res.status(400).json({
      success: false,
      message: "ID inválido."
    });
  }

  let code = deviceRooms.get(deviceId);
  let room = code ? getRoom(code) : null;

  if (!room || !room.devices.includes(deviceId)) {
    code = crypto.randomBytes(3).toString("hex").toUpperCase();

    room = {
      devices: [deviceId],
      deviceInfo: {},
      deviceNames: {},
      locations: {}
    };

    rooms.set(code, room);
    deviceRooms.set(deviceId, code);
  }

  room.deviceInfo[deviceId] = deviceInfo || {};
  room.deviceNames[deviceId] = cleanName(name);

  res.json({ success: true, code });
});

app.post("/api/connect", (req, res) => {
  const { deviceId, targetId, name } = req.body;

  if (
    !validId(deviceId) ||
    !validId(targetId) ||
    deviceId === targetId
  ) {
    return res.status(400).json({
      success: false,
      message: "ID inválido."
    });
  }

  const targetCode = deviceRooms.get(targetId);
  const targetRoom = targetCode ? getRoom(targetCode) : null;

  if (!targetRoom || !targetRoom.devices.includes(targetId)) {
    return res.status(404).json({
      success: false,
      message: "El teléfono todavía no está registrado."
    });
  }

  if (
    targetRoom.devices.length >= 2 &&
    !targetRoom.devices.includes(deviceId)
  ) {
    return res.status(403).json({
      success: false,
      message: "El grupo ya tiene dos teléfonos."
    });
  }

  const requestId = crypto.randomBytes(12).toString("hex");

  pendingRequests.set(requestId, {
    deviceId,
    targetId,
    code: targetCode,
    senderName: cleanName(name),
    createdAt: Date.now()
  });

  res.json({
    success: true,
    pending: true,
    requestId,
    message: "Solicitud enviada."
  });
});

app.get("/api/requests/:deviceId", (req, res) => {
  const deviceId = req.params.deviceId;

  if (!validId(deviceId)) {
    return res.status(400).json({ success: false });
  }

  const requests = [];

  for (const [requestId, request] of pendingRequests) {
    if (request.targetId === deviceId) {
      requests.push({
        requestId,
        deviceId: request.deviceId,
        name: request.senderName
      });
    }
  }

  res.json({ success: true, requests });
});

app.post("/api/accept", (req, res) => {
  const { requestId, deviceId, deviceInfo, name } = req.body;

  const request = pendingRequests.get(requestId);

  if (!request || request.targetId !== deviceId) {
    return res.status(403).json({
      success: false,
      message: "La solicitud ya no existe o no es válida."
    });
  }

  const room = getRoom(request.code);

  if (!room || !room.devices.includes(request.targetId)) {
    pendingRequests.delete(requestId);

    return res.status(404).json({
      success: false,
      message: "La sala ya no existe. Envía una nueva solicitud."
    });
  }

  // CORRECCIÓN: solo rechazar si el grupo está lleno
  // y el dispositivo solicitante todavía no pertenece a él.
  if (
    room.devices.length >= 2 &&
    !room.devices.includes(request.deviceId)
  ) {
    return res.status(403).json({
      success: false,
      message: "El grupo ya tiene dos teléfonos."
    });
  }

  if (!room.devices.includes(request.deviceId)) {
    room.devices.push(request.deviceId);
  }

  room.deviceInfo[deviceId] = deviceInfo || {};
  room.deviceNames[deviceId] = cleanName(name);
  room.deviceNames[request.deviceId] = request.senderName;

  // Ambos teléfonos quedan asociados a la misma sala.
  deviceRooms.set(deviceId, request.code);
  deviceRooms.set(request.deviceId, request.code);

  pendingRequests.delete(requestId);

  res.json({
    success: true,
    code: request.code,
    message: "Conexión completada."
  });
});

app.post("/api/join", (req, res) => {
  const { code, deviceId, deviceInfo, name } = req.body;
  const room = getRoom(code);

  if (
    !room ||
    !validId(deviceId) ||
    !room.devices.includes(deviceId)
  ) {
    return res.status(403).json({
      success: false,
      message: "No perteneces a este grupo."
    });
  }

  room.deviceInfo[deviceId] = deviceInfo || {};
  room.deviceNames[deviceId] = cleanName(name);

  deviceRooms.set(deviceId, String(code).toUpperCase());

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

  const room = getRoom(code);

  if (!room || !room.devices.includes(deviceId)) {
    return res.status(403).json({
      success: false,
      message: "Dispositivo no autorizado."
    });
  }

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    return res.status(400).json({
      success: false,
      message: "Coordenadas inválidas."
    });
  }

  room.locations[deviceId] = {
    latitude,
    longitude,
    accuracy,
    updatedAt: Date.now()
  };

  res.json({ success: true });
});

app.get("/api/location/:code", (req, res) => {
  const room = getRoom(req.params.code);

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Grupo no encontrado."
    });
  }

  res.json({
    success: true,
    locations: room.locations,
    devices: room.devices,
    deviceInfo: room.deviceInfo,
    deviceNames: room.deviceNames
  });
});

app.post("/api/stop", (req, res) => {
  const { code, deviceId } = req.body;
  const room = getRoom(code);

  if (!room || !room.devices.includes(deviceId)) {
    return res.status(403).json({ success: false });
  }

  delete room.locations[deviceId];

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log("Phone Tracker 4.2 activo en puerto " + PORT);
});
                      
