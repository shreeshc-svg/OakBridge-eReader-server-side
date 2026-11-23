import app from './src/app';
import { appConfig } from './src/config/app.config';
import { connectRedis } from './src/config/redis';
import { initReminderJob } from './src/utils/reminder.job';
import { initCartReminderJob } from './src/utils/cart_reminder.job';
import { initPaymentReconcileJob } from './src/utils/payment_reconcile.job';

const port = appConfig.port;

const startServer = async () => {
     try {
          await connectRedis();
          initReminderJob();
          initCartReminderJob();
          initPaymentReconcileJob();

          app.listen(port, () => {
               console.log(`Server running on port ${port}`);
          });
     } catch (error) {
          console.error('Failed to start application:', error);
     }
};

startServer();
