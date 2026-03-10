import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const configuredClientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const allowedOrigins = new Set(
  process.env.NODE_ENV === 'production'
    ? configuredClientUrls.length > 0
      ? configuredClientUrls
      : ['http://localhost:5173']
    : ['http://localhost:5173', 'http://localhost:5174', ...configuredClientUrls],
);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
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

app.use('/uploads', express.static(path.resolve('uploads')));

app.use('/api/v1', apiRouter);

app.use(errorHandler);

export default app;
