import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import config from './config.js';
import logger from './lib/logger.js';
import { Sentry, sentryEnabled } from './lib/sentry.js';
import openapi from './docs/openapi.js';
import { errorHandler, notFound } from './middleware/error.js';
import { LOCAL_UPLOAD_DIR } from './lib/storage.js';
import { providerName } from './lib/payments.js';
import { getElastic } from './lib/search.js';
import { getRedis } from './lib/redis.js';
import authRoutes from './routes/auth.js';
import vendorRoutes from './routes/vendors.js';
import productRoutes from './routes/products.js';
import reviewRoutes from './routes/reviews.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import couponRoutes from './routes/coupons.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import meRoutes from './routes/me.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientUrl.split(','), credentials: true }));
  app.use(
    pinoHttp({
      logger,
      // reuse the id from a proxy if there is one, so logs can be matched up
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  // must come before express.json() so Stripe gets the raw body
  app.use('/api/webhooks', webhookRoutes);
  app.use(express.json({ limit: '1mb' }));

  if (config.env !== 'test') {
    // only the password endpoints, /auth/me runs on every page load
    const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 });
    app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password'], authLimiter);
  }
  app.use('/uploads', express.static(LOCAL_UPLOAD_DIR, { maxAge: '7d' }));

  app.get('/api/health', async (_req, res) => {
    let redis = 'down';
    try {
      redis = (await getRedis().ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      /* reported below */
    }
    res.json({
      status: 'ok',
      mongo: mongoose.connection.readyState === 1 ? 'up' : 'down',
      redis,
      search: getElastic() ? 'elasticsearch' : 'mongo-fallback',
      payments: providerName(),
    });
  });

  app.get('/api/openapi.json', (_req, res) => res.json(openapi));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Vendora API' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/vendors', vendorRoutes);
  app.use('/api/products/:productId/reviews', reviewRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  if (sentryEnabled) Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);
  return app;
}
