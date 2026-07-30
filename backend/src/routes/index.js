const { Router } = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const buildingRoutes = require('./building.routes');
const inspectionRoutes = require('./inspection.routes');
const calendarRoutes = require('./calendar.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/buildings', buildingRoutes);
router.use('/inspections', inspectionRoutes);
router.use('/calendar', calendarRoutes);

router.get('/health', (_, res) => res.json({ status: 'ok' }));

module.exports = router;
