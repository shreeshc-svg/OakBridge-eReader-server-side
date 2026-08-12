import { createClient } from 'redis';
import { securityConfig } from './app.config';

export const redisClient = createClient({
     url: securityConfig.redisUrl,
});

redisClient.on('connect', () => {
     console.log('redis connected');
});

redisClient.on('error', (err) => {
     console.error('Redis Error:', err);
});

export const connectRedis = async () => {
     if (!redisClient.isOpen) {
          await redisClient.connect();
     }
};
