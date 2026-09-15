import express from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getWeatherProvider } from '../providers/weather/index.js';

const router = express.Router();
router.use(requireAuth);

router.get('/weather/districts/:id', asyncHandler(async (req, res) => {
  const district = db.prepare('SELECT * FROM districts WHERE id = ?').get(req.params.id);
  if (!district) return res.status(404).json({ error: 'District not found' });
  const weather = await getWeatherProvider().getDistrictWeather(district.id);
  res.json({ district: district.name, ...weather });
}));

router.get('/weather', asyncHandler(async (req, res) => {
  const districts = db.prepare('SELECT id, name FROM districts').all();
  const provider = getWeatherProvider();
  const results = [];
  for (const d of districts) {
    const w = await provider.getDistrictWeather(d.id);
    results.push({ district_id: d.id, district_name: d.name, ...w });
  }
  res.json(results);
}));

export default router;
