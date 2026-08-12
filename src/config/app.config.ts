import dotenv from 'dotenv';

const envFile =
     process.env.NODE_ENV === 'production'
          ? '.env.production'
          : '.env.development';

dotenv.config({ path: envFile });

export const appConfig = {
     name: 'Oakbridge e-Reader',
     env: process.env.NODE_ENV,
     port: Number(process.env.PORT || 8000),
};

export const dbConfig = {
     db: process.env.DATABASE_URL,
};

export const securityConfig = {
     corsOrigin: process.env.CORS_ORIGIN?.split(','),
     jwtSecret: process.env.ACCESS_TOKEN_SECRET,
     refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
     accessTokenExpiresIn: '15m',
     refreshTokenExpiresIn: '7d',
     redisUrl: process.env.REDIS_URL,
     node_env: process.env.NODE_ENV,
     device_limit: {
          laptop: 2,
          mobile: 1,
          tablet: 1,
     },
};

export const mailConfig = {
     smtp_host: process.env.SMTP_HOST,
     port: Number(process.env.SMTP_PORT || 465),
     secure: Number(process.env.SMTP_PORT || 465) === 465,
     auth: {
          smtp_email: process.env.SMTP_EMAIL,
          smtp_password: process.env.SMTP_PASSWORD,
     },
};

export const awsConfig = {
     AWS_REGION: process.env.AWS_REGION!,
     AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME!,
     credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
     },
};
