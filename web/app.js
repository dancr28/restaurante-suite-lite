const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Carga de Rutas Principales del Punto de Venta
app.use('/api/pos', require('./routes/pos.routes'));
app.use('/api/items', require('./routes/items.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/receipts', require('./routes/receipts.routes'));

module.exports = app;
