import app from './app.js';
import { assertConfig, config } from './config/index.js';
import { createServer } from 'http';
import {
  startExpiryScheduler,
  startExpiryCountdownScheduler,
  startCallLogsCleanupScheduler,
} from './services/scheduler.service.js';

assertConfig();

// Last line of defence: a stray rejected promise (e.g. a fire-and-forget
// call that fails) is logged instead of terminating the process. Route
// handler errors are already handled by utils/asyncErrors.js.
process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL][process] unhandledRejection:', reason);
});

// Start database auto-expiry scheduling
startExpiryScheduler();
// Start last-7-days SMS countdown to owners whose QR is about to expire.
startExpiryCountdownScheduler();
// Mark stale in-progress call_logs as timeout every 30 min.
startCallLogsCleanupScheduler();

const httpServer = createServer(app);

httpServer.listen(config.port, () => {
  console.log(`Emergency Alert API listening on http://localhost:${config.port}`);
});
