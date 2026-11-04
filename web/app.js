const express = require('express');
const app = express();
const path = require('path');
const env = require('./config/env');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rutas Esenciales para la versión Lite (Escuela)
app.use('/api/pos', require('./routes/pos.routes'));
app.use('/api/items', require('./routes/items.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/receipts', require('./routes/receipts.routes'));

// Control de Perfil Académico
if (env.DEPLOYMENT_PROFILE === 'academic') {
  console.log('----------------------------------------------------');
  console.log(' PERFIL ACADÉMICO ACTIVO: Restaurante Suite Lite');
  console.log(' Módulos de integraciones externas desactivados.');
  console.log('----------------------------------------------------');
} else {
  // En producción normal se cargarían las rutas adicionales (WhatsApp, MP, etc.)
}

module.exports = app;
