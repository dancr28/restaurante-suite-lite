const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { imprimirTestPrueba, abrirCajonDinero } = require('../services/printer.service');

// 1. Obtener todas las configuraciones almacenadas
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT clave, valor FROM configuracion WHERE clave='payroll_config'",
    );
    const settings = {};
    rows
      .filter((r) => !['settings_pre_v4', 'integrations_v3'].includes(r.clave))
      .forEach((r) => (settings[r.clave] = r.valor));
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

// 2. Guardar configuraciones de forma masiva
router.post('/guardar', (req, res) =>
  res.status(410).json({
    error: 'Utiliza Configuración por módulos o el editor de nómina para guardar con validación.',
  }),
);

// 3. Prueba de impresión de diagnóstico (Test Print)
router.post('/test-print', async (req, res) => {
  try {
    const resultado = await imprimirTestPrueba();
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Prueba de pulso eléctrico al cajón de dinero
router.post('/abrir-cajon', async (req, res) => {
  try {
    await abrirCajonDinero();
    res.json({ success: true, message: 'Pulso enviado al cajón' });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo completar la operación' });
  }
});

module.exports = router;
