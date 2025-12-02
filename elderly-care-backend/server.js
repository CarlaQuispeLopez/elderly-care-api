const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;  // ✅ IMPORTANTE: Usar PORT de Render

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Ruta del archivo de datos
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'devices.json');

// Crear directorio de datos si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✅ Directorio /data creado');
}

// Inicializar archivo de datos si no existe
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ devices: [] }, null, 2));
  console.log('✅ Archivo devices.json inicializado');
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

// ==================== ENDPOINTS ====================

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Elder Care API v1.0 - Running on Render',
    endpoints: [
      'GET /api/test',
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

// Endpoint de prueba
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: '✅ API funcionando correctamente en Render',
    timestamp: new Date().toISOString()
  });
});

// 1. Registrar nuevo dispositivo
app.post('/api/devices/register', (req, res) => {
  const { deviceId, deviceName, ownerName } = req.body;

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
      message: 'El dispositivo ya está registrado' 
    });
  }

  const newDevice = {
    id: uuidv4(),
    deviceId,
    deviceName,
    ownerName: ownerName || 'Adulto Mayor',
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

// 2. Actualizar datos de salud
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
      message: 'Datos actualizados exitosamente' 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: 'Error al guardar datos' 
    });
  }
});

// 3. Obtener todos los dispositivos
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

// 4. Obtener dispositivo específico
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

// 5. Eliminar dispositivo
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
      message: 'Dispositivo eliminado exitosamente' 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: 'Error al eliminar dispositivo' 
    });
  }
});

// 6. Actualizar dispositivo
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

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n====================================');
  console.log(`🚀 Elder Care API v1.0`);
  console.log(`🌍 Servidor corriendo en puerto ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('====================================\n');
});
