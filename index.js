import './load-env.js';

import axios from 'axios';
import cors from 'cors';
import express from 'express';

import breakdownRouter from './routes/breakdown.js';
import notebookRouter from './routes/notebook.js';
import verseRouter from './routes/verse.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

/** When unset, reflect request Origin (any port/host) so Vite, previews, and LAN dev work. */
function corsOptions() {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return {
      origin: true,
      credentials: true,
    };
  }

  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.includes('*')) {
    return { origin: true, credentials: true };
  }

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, allowed.includes(origin));
    },
    credentials: true,
  };
}

app.use(cors(corsOptions()));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/verse', verseRouter);
app.use('/api/breakdown', breakdownRouter);
app.use('/api/notebook', notebookRouter);

app.use((err, _req, res, _next) => {
  console.error('[study-logos]', err);

  if (axios.isAxiosError(err) && err.response) {
    const data = err.response.data;
    const msg =
      typeof data === 'string'
        ? data
        : data?.message ?? data?.error ?? err.message;
    return res.status(502).json({
      error:
        typeof msg === 'string'
          ? msg
          : 'The Bible API returned an error. Check BIBLE_API_KEY and verse reference.',
    });
  }

  const status = err.statusCode ?? 500;
  const message = err.message ?? 'Unexpected server error';

  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: typeof message === 'string' ? message : 'Unexpected server error',
  });
});

app.listen(PORT, () => {
  console.log(`Study Logos API listening on http://localhost:${PORT}`);
});
