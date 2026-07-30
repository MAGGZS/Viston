const prisma = require('../utils/prisma');
const { AppError } = require('../utils/AppError');

async function getFloors(req, res) {
  const building = await prisma.building.findUnique({
    where: { id: req.params.id },
    include: { floors: { orderBy: { order: 'asc' } } },
  });
  if (!building) throw new AppError('Prédio não encontrado', 404);
  return res.json({ building: { id: building.id, name: building.name }, floors: building.floors });
}

module.exports = { getFloors };
