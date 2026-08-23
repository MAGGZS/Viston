import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  MAINTENANCE_TYPE_LABEL,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
} from '../utils/maintenanceOptions';
import { zonedDayKey } from '../utils/timezone';

/**
 * O relatório de manutenções do período, em .docx.
 *
 * Só a forma mora aqui: quais chamados entram é decisão de
 * `ticketService.reportPeriod`, e o documento apenas apresenta o que recebeu.
 * A separação é o que permite mudar o layout sem tocar na consulta.
 *
 * O documento é uma lista: uma linha por ocorrência finalizada pelo moderador,
 * com os campos que identificam o serviço e a descrição encurtada — quem lê o
 * consolidado quer reconhecer a ocorrência, não reler o relato inteiro. No fim,
 * o gasto total do período, que é a pergunta que faz este documento existir.
 */

type ReportTicket = {
  maintenance_type: string;
  category: string;
  priority: string;
  description: string;
  responsible: string | null;
  done_report: string | null;
  maintenance_note: string | null;
  maintenance_cost: number | null;
  closed_at: Date | null;
  closed_by: { name: string } | null;
  floor: { label: string } | null;
  report: { date: Date | string | null; inspector: { name: string } | null };
};

export type ReportData = {
  building: { id: string; name: string };
  from: Date;
  to: Date;
  tickets: ReportTicket[];
  total_cost: number;
};

/** Quanto da descrição cabe numa célula sem a tabela virar parede de texto. */
const RESUMO_MAX = 160;

/**
 * dd/MM/yyyy no fuso do produto.
 *
 * Pelo `zonedDayKey`, e não pelos getters do `Date`: o servidor roda em UTC, e
 * um chamado fechado às 22h de São Paulo apareceria no documento como fechado
 * no dia seguinte. É o mesmo cuidado que o calendário de vistorias já toma.
 */
function day(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const [year, month, dayOfMonth] = zonedDayKey(date).split('-');
  return `${dayOfMonth}/${month}/${year}`;
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

/**
 * A descrição encurtada.
 *
 * Corta na última palavra inteira antes do limite: cortar no meio de uma
 * palavra faz o resumo parecer erro de geração. Quebra de linha vira espaço,
 * porque dentro da célula ela só abriria buraco.
 */
function resumo(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= RESUMO_MAX) return flat;

  const cut = flat.slice(0, RESUMO_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Célula de tabela com texto simples — o grosso do documento é isto. */
function cell(text: string, opts: { bold?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold ?? false, size: 18 })],
      }),
    ],
  });
}

const GRID = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
};

/** Monta o documento e devolve os bytes, prontos para a resposta HTTP. */
export async function buildTicketReport(data: ReportData): Promise<Buffer> {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('Fechado em', { bold: true, width: 10 }),
      cell('Andar', { bold: true, width: 10 }),
      cell('Manutenção', { bold: true, width: 12 }),
      cell('Categoria', { bold: true, width: 11 }),
      cell('Prior.', { bold: true, width: 7 }),
      cell('Responsável', { bold: true, width: 12 }),
      cell('Descrição', { bold: true, width: 28 }),
      cell('Gasto', { bold: true, width: 10 }),
    ],
  });

  const rows = data.tickets.map(
    (t) =>
      new TableRow({
        children: [
          cell(day(t.closed_at)),
          cell(t.floor?.label ?? '—'),
          cell(label(MAINTENANCE_TYPE_LABEL, t.maintenance_type)),
          cell(label(CATEGORY_LABEL, t.category)),
          cell(label(PRIORITY_LABEL, t.priority)),
          cell(t.responsible ?? '—'),
          cell(resumo(t.description)),
          cell(money(t.maintenance_cost)),
        ],
      })
  );

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'Relatório de Manutenções', bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: data.building.name, size: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: `Manutenções finalizadas de ${day(data.from)} a ${day(data.to)}`,
          size: 20,
          color: '666666',
        }),
      ],
    }),
  ];

  if (data.tickets.length === 0) {
    // Sem ocorrências não há tabela: cabeçalho vazio sugere que a geração
    // falhou, e a frase diz exatamente o que houve.
    body.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Nenhuma manutenção foi finalizada neste período.', size: 20 }),
        ],
      })
    );
  } else {
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: GRID,
        rows: [header, ...rows],
      }),
      new Paragraph({
        spacing: { before: 360, after: 40 },
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `${data.tickets.length} manutenç${data.tickets.length === 1 ? 'ão finalizada' : 'ões finalizadas'} no período`,
            size: 20,
            color: '666666',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'Gasto total no período: ', size: 24 }),
          new TextRun({ text: money(data.total_cost), bold: true, size: 24 }),
        ],
      })
    );
  }

  const doc = new Document({
    creator: 'Viston',
    title: `Relatório de Manutenções — ${data.building.name}`,
    description: `Manutenções finalizadas de ${day(data.from)} a ${day(data.to)}`,
    sections: [{ children: body }],
  });

  return Packer.toBuffer(doc);
}

/**
 * Nome do arquivo baixado.
 *
 * Sem acento e sem espaço: o nome viaja no cabeçalho `Content-Disposition`, e
 * caractere fora de ASCII ali chega truncado ou trocado em parte dos clientes.
 */
export function reportFileName(data: ReportData): string {
  const slug = data.building.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  // Mesmo fuso do resto do documento: o nome do arquivo tem de bater com o
  // período impresso dentro dele.
  const stamp = (d: Date) => zonedDayKey(d).replace(/-/g, '');

  return `manutencoes-${slug || 'predio'}-${stamp(data.from)}-${stamp(data.to)}.docx`;
}
