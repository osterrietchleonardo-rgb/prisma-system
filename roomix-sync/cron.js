import cron from 'node-cron';
import { spawn } from 'child_process';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ─── Health Check Server (para que Easypanel no mate el proceso) ─────────────
const PORT = process.env.PORT || 3000;
createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'roomix-worker', uptime: process.uptime() }));
}).listen(PORT, () => {
  console.log(`🩺 Health check escuchando en puerto ${PORT}`);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  ⏰ Roomix Docker Worker Inicializado                         ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('Cron iniciado. Esperando la próxima ejecución a las 03:00 AM...');

// Tarea principal (ejecutada todos los días a las 03:00 AM del huso horario local del contenedor)
cron.schedule('0 3 * * *', () => {
  console.log(`\n[${new Date().toISOString()}] 🚀 Disparando ejecución de sincronización...`);

  // Ejecuta el crawler en un proceso aislado para que libere RAM completamente al terminar
  const crawlerProcess = spawn('node', [join(__dirname, 'crawler.mjs')], {
    stdio: 'inherit',
    env: process.env // Pasa las variables de entorno actuales (Easypanel)
  });

  crawlerProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`[${new Date().toISOString()}] ✅ Sincronización completada exitosamente.`);
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Sincronización falló con código de salida: ${code}`);
    }
    console.log('Cron esperando la próxima ejecución a las 03:00 AM...');
  });
});
