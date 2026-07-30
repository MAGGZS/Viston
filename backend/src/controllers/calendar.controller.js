const prisma = require('../utils/prisma');

async function getCalendar(req, res) {
  const { month, year, range } = req.query;

  let startDate, endDate;
  const now = new Date();

  if (range === 'semestral') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (range === 'anual') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  } else {
    const m = month ? Number(month) - 1 : now.getMonth();
    const y = year ? Number(year) : now.getFullYear();
    startDate = new Date(y, m, 1);
    endDate = new Date(y, m + 1, 0);
  }

  const reports = await prisma.inspectionReport.findMany({
    where: {
      status: 'COMPLETED',
      date: { gte: startDate, lte: endDate },
    },
    select: {
      id: true,
      date: true,
      inspector: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { date: 'asc' },
  });

  // Group by date string
  const byDate = {};
  for (const r of reports) {
    const key = r.date.toISOString().split('T')[0];
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push({ id: r.id, inspector: r.inspector });
  }

  const heatmap = Object.entries(byDate).map(([date, entries]) => ({
    date,
    count: entries.length,
    entries,
  }));

  return res.json({ startDate, endDate, heatmap });
}

module.exports = { getCalendar };
