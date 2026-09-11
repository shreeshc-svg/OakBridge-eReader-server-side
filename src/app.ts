import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { securityConfig } from './config/app.config';
import { apiLimiter } from './middlewares/rate_limiter.middleware';

const app = express();
app.set('trust proxy', 1);

const corsOptions = {
     origin: securityConfig.corsOrigin,
     credentials: true,
};

// 1. Security Headers
app.use(
     helmet({
          crossOriginResourcePolicy: { policy: 'cross-origin' },
          contentSecurityPolicy: false, // allow flexible iframe & Blob loading for reader
     })
);

// 2. Response Compression (Gzip / Brotli)
app.use(compression());

// 3. General API Rate Limiting
app.use('/api', apiLimiter);

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors(corsOptions));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
     res.status(200).json({
          message: 'Server is running fine!',
     });
});

import authRouter from './modules/auth/auth.routes';
app.use('/api/auth', authRouter);

import categoryRouter from './modules/categories/categories.routes';
app.use('/api/category', categoryRouter);

import booksRouter from './modules/books/books.routes';
app.use('/api/books', booksRouter);

import dashboardRouter from './modules/dashboard/dashboard.routes';
app.use('/api/dashboard', dashboardRouter);

import libraryRouter from './modules/library/library.routes';
app.use('/api/library', libraryRouter);

import readerRouter from './modules/reader/reader.routes';
app.use('/api/reader', readerRouter);

import bannersRouter from './modules/store/banners/banners.routes';
app.use('/api/banners', bannersRouter);

import paymentsRouter from './modules/payments/payments.routes';
app.use('/api/payments', paymentsRouter);

import reviewsRouter from './modules/reviews/reviews.routes';
app.use('/api/reviews', reviewsRouter);

import institutionRouter from './modules/institution/institution.routes';
app.use('/api/institution', institutionRouter);

import settingsRouter from './modules/settings/settings.routes';
app.use('/api/settings', settingsRouter);

import superadminRouter from './modules/superadmin/superadmin.routes';
app.use('/api/superadmin', superadminRouter);

import notificationsRouter from './modules/notifications/notifications.routes';
app.use('/api/notifications', notificationsRouter);

import cartRouter from './modules/cart/cart.routes';
app.use('/api/cart', cartRouter);

import mailingRouter from './modules/mailing/mailing.routes';
app.use('/api/mailing', mailingRouter);

export default app;
