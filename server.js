
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json({limit:"30kb"}));

const PORT = process.env.PORT || 3000;

const rooms = new Map();
const deviceRooms = new Map();

app.get("/", (req,res)=>{
 res.json({
  app:"Phone Tracker",
  status:"online",
  version:"3.0"
 });
});

app.get("/health",(req,res)=>{
 res.json({status:"ok"});
});

// Crear una conexión usando el ID permanente
app.post("/api/connect",(req,res)=>{
 const {deviceId, targetId, deviceInfo} = req.body;

 if(
  typeof deviceId!=="string" ||
  typeof targetId!=="string" ||
  !deviceId.startsWith("PT-") ||
  !targetId.startsWith("PT-") ||
  deviceId===targetId
 ){
  return res.status(400).json({
   success:false,
   message:"ID inválido."
  });
 }

 let roomCode=deviceRooms.get(targetId);

 if(roomCode){
  const existing=rooms.get(roomCode);

  if(existing && existing.devices.length>=2 &&
     !existing.devices.includes(deviceId)){
   return res.status(403).json({
    success:false,
    message:"El grupo ya tiene dos teléfonos."
   });
  }
 }

 if(!roomCode || !rooms.has(roomCode)){
  roomCode=crypto.randomBytes(3).toString("hex").toUpperCase();

  rooms.set(roomCode,{
   devices:[targetId],
   deviceInfo:{},
   locations:{}
  });

  deviceRooms.set(targetId,roomCode);
 }

 const room=rooms.get(roomCode);

 if(!room.devices.includes(deviceId)){
  if(room.devices.length>=2){
   return res.status(403).json({
    success:false,
    message:"El grupo ya tiene dos teléfonos."
   });
  }

  room.devices.push(deviceId);
 }

 room.deviceInfo[deviceId]=deviceInfo || {};

 res.json({
  success:true,
  code:roomCode
 });
});

// Registrar información de un dispositivo
app.post("/api/join",(req,res)=>{
 const {code,deviceId,deviceInfo}=req.body;
 const room=rooms.get(String(code || "").toUpperCase());

 if(!room || !deviceId){
  return res.status(400).json({
   success:false,
   message:"Grupo o dispositivo inválido."
  });
 }

 if(!room.devices.includes(deviceId)){
  if(room.devices.length>=2){
   return res.status(403).json({
    success:false,
    message:"El grupo ya tiene dos teléfonos."
   });
  }

  room.devices.push(deviceId);
 }

 room.deviceInfo[deviceId]=deviceInfo || {};

 deviceRooms.set(deviceId,String(code).toUpperCase());

 res.json({success:true});
});

// Compartir ubicación voluntariamente
app.post("/api/location",(req,res)=>{
 const {code,deviceId,latitude,longitude,accuracy}=req.body;
 const room=rooms.get(String(code || "").toUpperCase());

 if(!room || !room.devices.includes(deviceId)){
  return res.status(403).json({success:false});
 }

 if(
  typeof latitude!=="number" ||
  typeof longitude!=="number" ||
  !Number.isFinite(latitude) ||
  !Number.isFinite(longitude) ||
  latitude < -90 || latitude > 90 ||
  longitude < -180 || longitude > 180
 ){
  return res.status(400).json({success:false});
 }

 room.locations[deviceId]={
  latitude,
  longitude,
  accuracy,
  updatedAt:Date.now()
 };

 res.json({success:true});
});

// Consultar ubicaciones
app.get("/api/location/:code",(req,res)=>{
 const room=rooms.get(req.params.code.toUpperCase());

 if(!room){
  return res.status(404).json({success:false});
 }

 res.json({
  success:true,
  locations:room.locations,
  devices:room.deviceInfo
 });
});

// Detener ubicación
app.post("/api/stop",(req,res)=>{
 const {code,deviceId}=req.body;
 const room=rooms.get(String(code || "").toUpperCase());

 if(!room || !room.devices.includes(deviceId)){
  return res.status(403).json({success:false});
 }

 delete room.locations[deviceId];

 res.json({success:true});
});

app.listen(PORT,()=>{
 console.log("Phone Tracker activo en puerto "+PORT);
});
    
