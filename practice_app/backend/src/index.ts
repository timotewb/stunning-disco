import express from 'express';
import cors from 'cors';
import path from 'path';
import teamRouter from './routes/team';
import dimensionsRouter from './routes/dimensions';
import dimensionNodesRouter from './routes/dimension-nodes';
import snapshotsRouter from './routes/snapshots';
import matrixRouter from './routes/matrix';
import allocationsRouter from './routes/allocations';
import allocationTypesRouter from './routes/allocationTypes';
import smeRouter from './routes/sme';
import exportRouter from './routes/export';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:/app/data/practice.db';
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

app.use('/api/team', teamRouter);
app.use('/api/dimensions', dimensionsRouter);
app.use('/api/dimension-nodes', dimensionNodesRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/matrix', matrixRouter);
app.use('/api/matrix-entry', matrixRouter);
app.use('/api/allocations', allocationsRouter);
app.use('/api/allocation-types', allocationTypesRouter);
app.use('/api/sme', smeRouter);
app.use('/api/export', exportRouter);

if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
