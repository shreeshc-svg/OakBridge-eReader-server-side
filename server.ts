import app from './src/app';
import { appConfig } from './src/config/app.config';
import { connectRedis } from './src/config/redis';
import { initReminderJob } from './src/utils/reminder.job';
import { initCartReminderJob } from './src/utils/cart_reminder.job';

const port = appConfig.port;

const startServer = async () => {
     try {
          await connectRedis();
          initReminderJob();
          initCartReminderJob();

          app.listen(port, () => {
               console.log(`Server running on port ${port}`);
          });
     } catch (error) {
          console.error('Failed to start application:', error);
     }
};

startServer();
