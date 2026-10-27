// -----------------------------------------------------------------------------
// Entry point: SDK wiring only (src/handlers.js registers every handler BEFORE
// connect(), and delegates to the SolakonApp of src/app.js). Before
// connecting, a return to automatic mode kept in /data (not seen applied
// before a restart) is written again: it never waits for Gladys nor for the
// configuration.
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { SolakonApp } from './src/app.js';
import { registerHandlers } from './src/handlers.js';

const gladys = new GladysIntegration();
const app = new SolakonApp({ gladys });

registerHandlers(gladys, app, logger);
gladys.handleShutdown(() => app.shutdown());

logger.info('Starting the Solakon ONE integration...');
app.boot().catch((err) => logger.warn(`Stop kept in /data: ${err.message}`));
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
