const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Datos en memoria para emergencias activas
let activeEmergencies = [];

// Ruta del archivo de datos
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'devices.json');
const EMERGENCY_FILE = path.join(DATA_DIR, 'emergencies.json');

// Crear directorio de datos si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✅ Directorio /data creado');
}

// Inicializar archivos
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ devices: [] }, null, 2));
  console.log('✅ Archivo devices.json inicializado');
}

if (!fs.existsSync(EMERGENCY_FILE)) {
  fs.writeFileSync(EMERGENCY_FILE, JSON.stringify({ emergencies: [] }, null, 2));
  console.log('✅ Archivo emergencies.json inicializado');
}

// Funciones auxiliares
function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error leyendo datos:', error);
    return { devices: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Error escribiendo datos:', error);
    return false;
  }
}

function readEmergencies() {
  try {
    const data = fs.readFileSync(EMERGENCY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { emergencies: [] };
  }
}

function writeEmergencies(data) {
  try {
    fs.writeFileSync(EMERGENCY_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

// ==================== WEBSOCKET ====================

io.on('connection', (socket) => {
  console.log('✅ Cliente conectado:', socket.id);

  // Enviar emergencias activas al conectarse
  socket.emit('active_emergencies', activeEmergencies);

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
  });
});

// ==================== ENDPOINTS ====================

app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Elder Care SOS API v2.0',
    endpoints: [
      'GET /api/test',
      'POST /api/sos - Enviar emergencia SOS',
      'GET /api/emergencies - Obtener emergencias activas',
      'POST /api/emergencies/:id/resolve - Resolver emergencia',
      'POST /api/devices/register',
      'POST /api/health',
      'GET /api/devices',
      'GET /api/devices/:deviceId',
      'DELETE /api/devices/:deviceId',
      'PUT /api/devices/:deviceId'
    ],
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: '✅ API funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// ==================== SOS ENDPOINT ====================

app.post('/api/sos', (req, res) => {
  console.log('🚨 Recibiendo SOS:', JSON.stringify(req.body, null, 2));
  
  const { deviceId, ownerDisplayName, location } = req.body;

  if (!deviceId) {
    console.error('❌ deviceId faltante');
    return res.status(400).json({ 
      success: false, 
      message: 'deviceId es requerido' 
    });
  }

  if (!location || !location.latitude || !location.longitude) {
    console.error('❌ location faltante o incompleta');
    return res.status(400).json({ 
      success: false, 
      message: 'location con latitude y longitude son requeridos' 
    });
  }

  const data = readData();
  const device = data.devices.find(d => d.deviceId === deviceId);

  if (!device) {
    console.error('❌ Dispositivo no encontrado:', deviceId);
    return res.status(404).json({ 
      success: false, 
      message: 'Dispositivo no encontrado. Registre el dispositivo primero.' 
    });
  }

  const emergency = {
    id: uuidv4(),
    deviceId,
    ownerDisplayName: ownerDisplayName || device.ownerDisplayName || device.ownerName || 'Usuario',
    deviceName: device.deviceName,
    location: {
      latitude: parseFloat(location.latitude),
      longitude: parseFloat(location.longitude),
      address: location.address || ''
    },
    timestamp: new Date().toISOString(),
    status: 'active',
    resolvedAt: null
  };

  // Guardar en archivo
  const emergencyData = readEmergencies();
  emergencyData.emergencies.push(emergency);
  writeEmergencies(emergencyData);

  // Guardar en memoria
  activeEmergencies.push(emergency);

  // Emitir a todos los clientes conectados
  console.log('📡 Emitiendo emergencia a todos los clientes conectados');
  io.emit('new_emergency', emergency);

  console.log(`✅ EMERGENCIA REGISTRADA: ${emergency.ownerDisplayName} - ${location.address}`);

  res.json({ 
    success: true, 
    message: 'Emergencia registrada y notificada',
    emergency 
  });
});

// Obtener emergencias activas
app.get('/api/emergencies', (req, res) => {
  res.json({ 
    success: true, 
    emergencies: activeEmergencies 
  });
});

// Resolver emergencia
app.post('/api/emergencies/:id/resolve', (req, res) => {
  const { id } = req.params;
  
  const index = activeEmergencies.findIndex(e => e.id === id);
  
  if (index === -1) {
    return res.status(404).json({ 
      success: false, 
      message: 'Emergencia no encontrada' 
    });
  }

  activeEmergencies[index].status = 'resolved';
  activeEmergencies[index].resolvedAt = new Date().toISOString();

  // Actualizar archivo
  const emergencyData = readEmergencies();
  const fileIndex = emergencyData.emergencies.findIndex(e => e.id === id);
  if (fileIndex !== -1) {
    emergencyData.emergencies[fileIndex].status = 'resolved';
    emergencyData.emergencies[fileIndex].resolvedAt = new Date().toISOString();
    writeEmergencies(emergencyData);
  }

  // Notificar a clientes
  io.emit('emergency_resolved', { id });

  console.log(`✅ Emergencia resuelta: ${id}`);

  res.json({ 
    success: true, 
    message: 'Emergencia resuelta' 
  });
});

// Registrar dispositivo (ACTUALIZADO)
app.post('/api/devices/register', (req, res) => {
  const { deviceId, deviceName, ownerName, ownerDisplayName } = req.body;

  if (!deviceId || !deviceName) {
    return res.status(400).json({ 
      success: false, 
      message: 'deviceId y deviceName son requeridos' 
    });
  }

  const data = readData();
  
  const existingDevice = data.devices.find(d => d.deviceId === deviceId);
  if (existingDevice) {
    return res.status(409).json({ 
      success: false, 
      message: 'Dispositivo ya registrado' 
    });
  }

  const newDevice = {
    id: uuidv4(),
    deviceId,
    deviceName,
    ownerName: ownerName || 'Adulto Mayor',
    ownerDisplayName: ownerDisplayName || ownerName || 'Adulto Mayor',
    registeredAt: new Date().toISOString(),
    lastUpdate: null,
    healthData: {
      heartRate: 0,
      steps: 0,
      battery: 0,
      location: {
        latitude: 0,
        longitude: 0,
        address: ''
      }
    },
    isOnline: false
  };

  data.devices.push(newDevice);
  
  if (writeData(data)) {
    console.log(`✅ Dispositivo registrado: ${deviceId} - ${ownerDisplayName}`);
    res.json({ 
      success: true, 
      message: 'Dispositivo registrado exitosamente',
      device: newDevice
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: 'Error al guardar datos' 
    });
  }
});

// Actualizar datos de salud
app.post('/api/health', (req, res) => {
  const { deviceId, heartRate, steps, battery, location } = req.body;

  if (!deviceId) {
    return res.status(400).json({ 
      success: false, 
      message: 'deviceId es requerido' 
    });
  }

  const data = readData();
  const deviceIndex = data.devices.findIndex(d => d.deviceId === deviceId);

  if (deviceIndex === -1) {
    return res.status(404).json({ 
      success: false, 
      message: 'Dispositivo no encontrado' 
    });
  }

  data.devices[deviceIndex].lastUpdate = new Date().toISOString();
  data.devices[deviceIndex].isOnline = true;
  
  if (heartRate !== undefined) {
    data.devices[deviceIndex].healthData.heartRate = heartRate;
  }
  
  if (steps !== undefined) {
    data.devices[deviceIndex].healthData.steps = steps;
  }
  
  if (battery !== undefined) {
    data.devices[deviceIndex].healthData.battery = battery;
  }
  
  if (location) {
    data.devices[deviceIndex].healthData.location = {
      latitude: location.latitude || 0,
      longitude: location.longitude || 0,
      address: location.address || ''
    };
  }

  if (writeData(data)) {
    res.json({ 
      success: true, 
      message: 'Datos actualizados' 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: 'Error al guardar' 
    });
  }
});

// Obtener todos los dispositivos
app.get('/api/devices', (req, res) => {
  const data = readData();
  
  const now = new Date();
  data.devices.forEach(device => {
    if (device.lastUpdate) {
      const lastUpdate = new Date(device.lastUpdate);
      const diffMinutes = (now - lastUpdate) / 1000 / 60;
      device.isOnline = diffMinutes < 2;
    }
  });
  
  writeData(data);
  
  res.json({ 
    success: true, 
    devices: data.devices 
  });
});

// Obtener dispositivo específico
app.get('/api/devices/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const data = readData();
  
  const device = data.devices.find(d => d.deviceId === deviceId);
  
  if (!device) {
    return res.status(404).json({ 
      success: false, 
      message: 'Dispositivo no encontrado' 
    });
  }
  
  if (device.lastUpdate) {
    const now = new Date();
    const lastUpdate = new Date(device.lastUpdate);
    const diffMinutes = (now - lastUpdate) / 1000 / 60;
    device.isOnline = diffMinutes < 2;
  }
  
  res.json({ 
    success: true, 
    device 
  });
});

// Eliminar dispositivo
app.delete('/api/devices/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const data = readData();
  
  const deviceIndex = data.devices.findIndex(d => d.deviceId === deviceId);
  
  if (deviceIndex === -1) {
    return res.status(404).json({ 
      success: false, 
      message: 'Dispositivo no encontrado' 
    });
  }
  
  data.devices.splice(deviceIndex, 1);
  
  if (writeData(data)) {
    res.json({ 
      success: true, 
      message: 'Dispositivo eliminado' 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: 'Error al eliminar' 
    });
  }
});

// Actualizar dispositivo
app.put('/api/devices/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { deviceName, ownerName } = req.body;
  
  const data = readData();
  const deviceIndex = data.devices.findIndex(d => d.deviceId === deviceId);
  
  if (deviceIndex === -1) {
    return res.status(404).json({ 
      success: false, 
      message: 'Dispositivo no encontrado' 
    });
  }
  
  if (deviceName) {
    data.devices[deviceIndex].deviceName = deviceName;
  }
  
  if (ownerName) {
    data.devices[deviceIndex].ownerName = ownerName;
  }
  
  if (writeData(data)) {
    res.json({ 
      success: true, 
      message: 'Dispositivo actualizado exitosamente',
      device: data.devices[deviceIndex]
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: 'Error al actualizar dispositivo' 
    });
  }
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Endpoint no encontrado' 
  });
});

// Iniciar servidor con WebSocket
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n====================================');
  console.log(`🚀 Elder Care SOS API v2.0`);
  console.log(`🌐 Servidor corriendo en puerto ${PORT}`);
  console.log(`🔴 WebSocket activo`);
  console.log('====================================\n');
});