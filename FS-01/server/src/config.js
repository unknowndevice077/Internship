import 'dotenv/config';

const env = process.env;

// "https://shop.app/" and "https://shop.app" must both match the browser's Origin header
const clientUrls = (env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT) || 4000,
  mongoUri: env.MONGO_URI || 'mongodb://127.0.0.1:27017/vendora',
  clientUrl: clientUrls[0],
  clientUrls,

  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  sessionTtlSeconds: 60 * 60 * 24 * 7,

  // leave REDIS_URL empty to use the in-memory mock (dev/tests only)
  redisUrl: env.REDIS_URL || '',
  // leave ELASTICSEARCH_URL empty to fall back to plain MongoDB queries
  elasticUrl: env.ELASTICSEARCH_URL || '',
  elasticIndex: env.ELASTICSEARCH_INDEX || 'products',

  s3: {
    bucket: env.S3_BUCKET || '',
    region: env.AWS_REGION || 'ap-south-1',
    publicUrl: env.S3_PUBLIC_URL || '',
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    // country for new vendor accounts (ISO code)
    accountCountry: (env.STRIPE_ACCOUNT_COUNTRY || 'us').toLowerCase(),
  },
  mail: {
    // e.g. smtp://user:pass@smtp.example.com:587, empty = log mail instead of sending
    smtpUrl: env.SMTP_URL || '',
    from: env.MAIL_FROM || 'Vendora <no-reply@vendora.test>',
  },
  currency: env.CURRENCY || 'usd',
  commissionRate: Number(env.COMMISSION_RATE ?? 0.1),
};

if (config.env === 'production' && config.jwtSecret.startsWith('dev-only')) {
  throw new Error('JWT_SECRET must be set in production');
}

export default config;
