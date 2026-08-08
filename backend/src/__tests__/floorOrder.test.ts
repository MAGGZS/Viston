import { floorRank, sortFloorsDesc } from '../utils/floorOrder';

describe('floorRank', () => {
  it('lê o número do andar', () => {
    expect(floorRank('6º Andar')).toBe(6);
    expect(floorRank('1° Andar')).toBe(1);
  });

  it('trata térreo como zero, com ou sem acento', () => {
    expect(floorRank('Térreo')).toBe(0);
    expect(floorRank('terreo')).toBe(0);
  });

  it('trata subsolo como negativo', () => {
    expect(floorRank('1º Subsolo')).toBe(-1);
    expect(floorRank('5º Subsolo')).toBe(-5);
  });
});

describe('sortFloorsDesc', () => {
  it('ordena do andar mais alto para o mais baixo', () => {
    const floors = [
      { label: 'Térreo' },
      { label: '2º Subsolo' },
      { label: '6º Andar' },
      { label: '1º Subsolo' },
      { label: '1º Andar' },
    ];

    expect(sortFloorsDesc(floors).map((f) => f.label)).toEqual([
      '6º Andar',
      '1º Andar',
      'Térreo',
      '1º Subsolo',
      '2º Subsolo',
    ]);
  });

  it('não altera o array original', () => {
    const floors = [{ label: 'Térreo' }, { label: '3º Andar' }];
    sortFloorsDesc(floors);
    expect(floors[0].label).toBe('Térreo');
  });
});
