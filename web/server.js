const config = require('./config/env'),
  app = require('./app'),
  db = require('./config/db');
const stopNotifications = require('./services/whatsapp.service').start();
const stopMonitor = require('./services/device-monitor.service').start();
let stopWorker = () => {};
let stopKdsWorker = () => {};
require('./services/print-queue.service')
  .start()

  .then((stop) => {
    stopWorker = stop;
  })

  .catch((err) => console.error('Cola de impresión no iniciada. Ejecuta db:migrate:', err.message));
{
  const kdsWorker = require('./services/kds-worker.service');
  let cancelled = false;
  let retryTimer = null;
  let stopRunningWorker = () => {};

  stopKdsWorker = () => {
    cancelled = true;
    clearTimeout(retryTimer);
    stopRunningWorker();
  };

  async function startKdsWorker() {
    if (cancelled) return;

    try {
      const stop = await kdsWorker.start();

      if (cancelled) {
        stop();
        return;
      }

      stopRunningWorker = stop;
      console.log('[kds worker] inicio confirmado');
    } catch (err) {
      if (cancelled) return;

      console.error(
        '[kds worker] no pudo iniciar; reintentando en 5 segundos:',
        err.message,
      );

      retryTimer = setTimeout(startKdsWorker, 5000);
      retryTimer.unref();
    }
  }

  void startKdsWorker();
}

const server = app.listen(config.port, config.host, () =>
  console.log('Restaurante LAB: http://' + config.host + ':' + config.port),
);

const wearableWs = require('./services/wearable-ws.service');
wearableWs.attach(server);
server.on('error', (err) => {
  console.error('No se pudo iniciar:', err.code);
  process.exitCode = 1;
  void stop();
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  stopWorker();
  stopKdsWorker();
  stopNotifications();
  stopMonitor();
  try {
    require('./services/wearable-ws.service').stop();
  } catch (err) {
    console.warn('[wearables/stop]', err.message);
  }

  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  server.close(async () => {
    await db.end();
    clearTimeout(timer);
  });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);


/* MP_RECOVERY_STARTUP_V1
 *
 * Recovery financiero Point.
 *
 * Se ejecuta una sola vez por proceso después
 * de cargar el servidor.
 *
 * NO crea nuevas orders.
 */
const mercadoPagoRecovery =
  require('./services/mercadopago-recovery.service');

const mercadoPagoRecoveryTimer =
  setTimeout(() => {
    mercadoPagoRecovery
      .start()
      .catch(err => {
        /*
         * No apagamos Restaurant Suite por una
         * caída temporal de Mercado Pago.
         *
         * Las operaciones permanecen persistidas
         * y bloqueadas para conciliación posterior.
         */
        console.error(
          '[mercadopago-recovery] no concluyó:',
          err.message
        );
      });
  }, 2500);

/*
 * El servidor HTTP mantiene vivo Node.
 * El timer por sí solo no debe impedir un shutdown.
 */
mercadoPagoRecoveryTimer.unref();

