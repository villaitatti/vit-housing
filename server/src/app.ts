import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/authenticate.js';

const app = express();
app.set('trust proxy', 1);
const configuredClientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOrigins = new Set(
  process.env.NODE_ENV === 'production'
    ? configuredClientUrls.length > 0
      ? configuredClientUrls
      : ['http://localhost:5175']
    : configuredClientUrls,
);
const isDevLocalhost = (origin: string) =>
  process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin);

app.use(
  helmet({
    referrerPolicy: {
      policy: 'no-referrer',
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || isDevLocalhost(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// Profile photos require authentication; listing photos are public
app.use('/uploads/profiles', authenticate, express.static(path.resolve('uploads/profiles')));
app.use('/uploads/listings', express.static(path.resolve('uploads/listings')));

app.use('/api/v1', apiRouter);

app.use(errorHandler);

export default app;
