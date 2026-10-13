/**
 * Dados de demonstração para gravar os vídeos tutoriais.
 *
 *   DEMO_CONFIRMAR=sim DEMO_SENHA=... npm run seed:demo
 *   DEMO_CONFIRMAR=sim DEMO_SENHA=... npm run seed:demo -- --so primeiros-passos-entrar-codigo
 *
 * Por decisão do proprietário, os dados vão para o banco de produção (o
 * `DATABASE_URL` do `.env.local`) e ele os exclui depois com
 * `npm run seed:demo:limpar`. Por isso a trava não é "recusar produção", e sim
 * exigir `DEMO_CONFIRMAR=sim` em toda execução que escreve: ninguém grava no
 * banco de produção por esquecer qual `.env` estava carregado.
 *
 * O que é demo e o que não é está em `demo-escopo.ts`: contas `@viston.demo` e
 * os prédios delas. Nada fora disso é lido para escrita, alterado ou apagado.
 * Se dados reais aparecerem misturados (uma conta de fora num prédio demo, por
 * exemplo), o script para sem escrever.
 *
 * As contas nascem com o e-mail já confirmado e a senha de `DEMO_SENHA`, com o
 * mesmo bcrypt do cadastro (`src/utils/password.ts`). Tudo vai direto pelo
 * Prisma: nenhum serviço de e-mail é chamado, e nenhuma ronda da agenda é
 * criada (o ciclo diário da agenda manda e-mail para a ronda que vence amanhã).
 *
 * `restaurar(id?)` é idempotente e volta o escopo demo ao estado inicial: a
 * esteira chama antes de cada funcionalidade, para um vídeo não sujar o outro.
 * O `id` é o da funcionalidade no roteiro; alguns vídeos pedem uma variação
 * pequena do estado inicial (ver `VARIACOES`).
 *
 * As datas são relativas ao dia em que roda, no fuso do produto
 * (America/Sao_Paulo, UTC-3, sem horário de verão desde 2019). A gravação deve
 * fixar o relógio do navegador no mesmo dia, senão os prazos mudam de texto.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import type {
  BuildingRole,
  FloorStatus,
  MaintenanceCategory,
  MaintenanceType,
  Prisma,
  PrismaClient,
  Priority,
  RecordStatus,
} from '@prisma/client';
import { lerEscopoDemo, hostDoBanco, PREDIOS_FIXOS, IDS_PREDIOS_FIXOS } from './demo-escopo';

// Mesma escolha de arquivo do src/config.ts. Precisa vir antes do Prisma, que
// lê DATABASE_URL quando o módulo carrega; por isso o require tardio abaixo.
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require('../src/lib/prisma') as { prisma: PrismaClient };
const { PASSWORD_ROUNDS } = require('../src/utils/password') as typeof import('../src/utils/password');
const { computeSla } = require('../src/utils/sla') as typeof import('../src/utils/sla');

// ─────────────────────────────────────────────
// ELENCO
// ─────────────────────────────────────────────

/** O elenco do topo de `tutoriais/roteiros.md`, mais as contas que as fichas do plano pedem. */
export const CONTAS = {
  // Gestores (tabela `managers`)
  rafael: { nome: 'Rafael Souza', email: 'rafael.souza@viston.demo', tipo: 'gestor' },
  helena: { nome: 'Helena Prado', email: 'helena.prado@viston.demo', tipo: 'gestor' },
  paula: { nome: 'Paula Nunes', email: 'paula.nunes@viston.demo', tipo: 'gestor' },
  // Contas comuns (tabela `users`)
  juliana: { nome: 'Juliana Alves', email: 'juliana.alves@viston.demo', tipo: 'comum' },
  marcos: { nome: 'Marcos Lima', email: 'marcos.lima@viston.demo', tipo: 'comum' },
  carlos: { nome: 'Carlos Pereira', email: 'carlos.pereira@viston.demo', tipo: 'comum' },
  ana: { nome: 'Ana Ribeiro', email: 'ana.ribeiro@viston.demo', tipo: 'comum' },
  beatriz: { nome: 'Beatriz Costa', email: 'beatriz.costa@viston.demo', tipo: 'comum' },
  lucas: { nome: 'Lucas Martins', email: 'lucas.martins@viston.demo', tipo: 'comum' },
  pedro: { nome: 'Pedro Rocha', email: 'pedro.rocha@viston.demo', tipo: 'comum' },
  // Fora do elenco do roteiro, pedidas pelas fichas do PLANO-VIDEOS:
  // 5.3 precisa de um segundo responsável (para reenviar) e o histórico do
  // painel (5.4), de mais de um; 1.1 Aba 5, de uma conta comum sem vínculo e
  // sem pedido.
  fernando: { nome: 'Fernando Dias', email: 'fernando.dias@viston.demo', tipo: 'comum' },
  diego: { nome: 'Diego Almeida', email: 'diego.almeida@viston.demo', tipo: 'comum' },
  // A conta de suporte, para enviar os pacotes de vídeo.
  suporte: { nome: 'Suporte Viston', email: 'suporte@viston.demo', tipo: 'admin' },
} as const;

type Chave = keyof typeof CONTAS;

/** Códigos fixos dos prédios, no alfabeto de `src/utils/shareKey.ts` (sem 0, O, 1, I, L). */
export const CODIGOS = {
  principal: 'DEMNSTRA2345', // aparece como DEMN-STRA-2345
  anexo: 'DEMNANEX6789',
  paula: 'DEMNPNXS6789',
} as const;

const ANDARES_PRINCIPAL = [
  '6º Andar', '5º Andar', '4º Andar', '3º Andar', '2º Andar', '1º Andar', 'Térreo',
  '1º Subsolo', '2º Subsolo', '3º Subsolo', '4º Subsolo', '5º Subsolo',
];
const ANDARES_ANEXO = ['3º Andar', '2º Andar', '1º Andar', 'Térreo'];
const ANDARES_PAULA = ['2º Andar', '1º Andar', 'Térreo'];

/**
 * Variações do estado inicial, por funcionalidade do roteiro.
 *
 * 1.2 e 1.3 mostram Lucas pedindo acesso: o pedido pendente do seed sai antes.
 * Fora delas, Helena é co-gestora do Edifício Demonstração, como no elenco.
 */
export const VARIACOES: Record<string, { semPedidoDoLucas?: boolean; semHelena?: boolean }> = {
  'primeiros-passos-entrar-qr-link': { semPedidoDoLucas: true },
  'primeiros-passos-entrar-codigo': { semPedidoDoLucas: true },
  // 2.6 Aba 1 adiciona Helena como co-gestora: ela começa sem vínculo.
  'gestor-cogestores-transferencia': { semHelena: true },
};

// ─────────────────────────────────────────────
// TRAVAS
// ─────────────────────────────────────────────

function exigirTravas(): string {
  if (process.env.DEMO_CONFIRMAR !== 'sim') {
    throw new Error(
      [
        'Seed de demonstração recusado: falta DEMO_CONFIRMAR=sim.',
        `Este script escreve no banco de "${hostDoBanco(process.env.DATABASE_URL)}" (nesta máquina, o .env.local aponta para o de produção).`,
        'Ele só mexe em contas @viston.demo e nos prédios delas, mas a confirmação é obrigatória a cada execução.',
      ].join('\n')
    );
  }
  const senha = process.env.DEMO_SENHA;
  if (!senha) throw new Error('Seed de demonstração recusado: defina DEMO_SENHA (a senha de todas as contas demo).');
  if (senha.length < 8) throw new Error('Seed de demonstração recusado: DEMO_SENHA precisa de ao menos 8 caracteres.');
  return senha;
}

// ─────────────────────────────────────────────
// DATAS (fuso do produto)
// ─────────────────────────────────────────────

const FUSO = 'America/Sao_Paulo';
const OFFSET_H = 3; // UTC-3

function hojeChave(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );
}

/** Meia-noite UTC do dia `atras` dias antes de hoje: o formato das colunas `@db.Date`. */
function dia(atras: number): Date {
  const [a, m, d] = hojeChave().split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - atras));
}

/** O instante `hh:mm` (hora de Brasília) do dia `atras` dias antes de hoje. */
function instante(atras: number, hh: number, mm = 0): Date {
  const base = dia(atras);
  return new Date(base.getTime() + ((hh + OFFSET_H) * 60 + mm) * 60_000);
}

/** PRNG determinístico: a mesma execução gera o mesmo histórico. */
function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────
// CONTAS
// ─────────────────────────────────────────────

type Ids = Record<Chave, string>;

async function garantirContas(senha: string): Promise<Ids> {
  const hash = await bcrypt.hash(senha, PASSWORD_ROUNDS);
  const agora = new Date();
  const ids = {} as Ids;

  for (const [chave, c] of Object.entries(CONTAS) as [Chave, (typeof CONTAS)[Chave]][]) {
    if (c.tipo === 'gestor') {
      const existente = await prisma.manager.findUnique({ where: { email: c.email } });
      if (existente) {
        const senhaConfere = await bcrypt.compare(senha, existente.password_hash);
        await prisma.manager.update({
          where: { id: existente.id },
          data: {
            name: c.nome,
            status: 'ACTIVE',
            avatar_url: null,
            suspended_at: null,
            email_verified_at: existente.email_verified_at ?? agora,
            ...(senhaConfere ? {} : { password_hash: hash }),
          },
        });
        ids[chave] = existente.id;
      } else {
        const criado = await prisma.manager.create({
          data: { name: c.nome, email: c.email, password_hash: hash, email_verified_at: agora },
        });
        ids[chave] = criado.id;
      }
    } else {
      const role = c.tipo === 'admin' ? 'ADMIN' : 'NONE';
      const existente = await prisma.user.findUnique({ where: { email: c.email } });
      if (existente) {
        const senhaConfere = await bcrypt.compare(senha, existente.password_hash);
        await prisma.user.update({
          where: { id: existente.id },
          data: {
            name: c.nome,
            role,
            status: 'ACTIVE',
            avatar_url: null,
            email_verified_at: existente.email_verified_at ?? agora,
            ...(senhaConfere ? {} : { password_hash: hash }),
          },
        });
        ids[chave] = existente.id;
      } else {
        const criado = await prisma.user.create({
          data: { name: c.nome, email: c.email, password_hash: hash, role, email_verified_at: agora },
        });
        ids[chave] = criado.id;
      }
    }
  }
  return ids;
}

// ─────────────────────────────────────────────
// VISTORIAS E CHAMADOS
// ─────────────────────────────────────────────

type Chamado = {
  tipo: MaintenanceType;
  categoria: MaintenanceCategory;
  prioridade: Priority;
  descricao: string;
  status: RecordStatus;
  responsavel?: 'marcos' | 'fernando';
  encaminhado?: Date;
  recebido?: Date;
  terminado?: Date;
  relatorio?: string;
  fechado?: Date;
  nota?: string;
  custo?: number;
  relatos?: { quando: Date; texto: string }[];
};

type Vistoria = {
  predio: string;
  inspetor: 'carlos' | 'ana';
  atras: number;
  hora: number;
  minuto?: number;
  /** Andar -> ocorrências. Andar fora do mapa fica OK, sem ocorrência. */
  ocorrencias: Record<string, Chamado[]>;
};

/** A situação do andar sai das ocorrências, como em `inspection.service.deriveFloorStatus`. */
function situacao(chamados: Chamado[]): FloorStatus {
  if (chamados.some((c) => c.prioridade === 'ALTA')) return 'PROBLEMA';
  if (chamados.some((c) => c.prioridade === 'MEDIA')) return 'ATENCAO';
  return 'OK';
}

/**
 * As vistorias recentes, escritas à mão: cada chamado aqui serve a um vídeo.
 *
 * - Dia de 2 dias atrás: Carlos de manhã e Ana à tarde (3.4 e 6.2), com
 *   chamados em aberto, encaminhado, em andamento e concluído, e Problema no
 *   2º Subsolo (3.2).
 * - Exatamente um chamado ENCAMINHADO para Marcos, com nota (4.1).
 * - Marcos com chamados em andamento, um aguardando terceiro e um atrasado
 *   (4.2, 4.3); um em andamento com relatos e um aguardando fechamento (5.3).
 * - Chamado aberto de prioridade alta sem responsável (5.2).
 */
function vistoriasRecentes(): Vistoria[] {
  const P = PREDIOS_FIXOS.principal;
  return [
    {
      predio: P, inspetor: 'carlos', atras: 16, hora: 9, minuto: 10,
      ocorrencias: {
        '3º Subsolo': [{
          tipo: 'VAZAMENTO', categoria: 'CORRETIVA', prioridade: 'ALTA',
          descricao: 'Vazamento na tubulação de água pluvial, perto da vaga 312.',
          status: 'EM_ANDAMENTO', responsavel: 'marcos',
          encaminhado: instante(15, 10), recebido: instante(14, 8, 30),
          nota: 'Verificar se o vazamento vem da prumada ou da junta do teto.',
          relatos: [{ quando: instante(10, 16), texto: 'Junta do teto refeita. Aguardando chuva para confirmar.' }],
        }],
        '4º Andar': [{
          tipo: 'PINTURA', categoria: 'PREVENTIVA', prioridade: 'MEDIA',
          descricao: 'Pintura descascada na parede do hall dos elevadores.',
          status: 'CONCLUIDO', responsavel: 'fernando',
          encaminhado: instante(15, 11), recebido: instante(15, 14), terminado: instante(12, 17),
          relatorio: 'Parede lixada e repintada com tinta acrílica.', fechado: instante(11, 9), custo: 420,
        }],
      },
    },
    {
      predio: P, inspetor: 'ana', atras: 12, hora: 10, minuto: 20,
      ocorrencias: {
        '2º Andar': [{
          tipo: 'AR_CONDICIONADO', categoria: 'CORRETIVA', prioridade: 'MEDIA',
          descricao: 'Ar-condicionado da sala 204 pingando sobre a mesa.',
          status: 'AGUARDANDO_TERCEIRO', responsavel: 'marcos',
          encaminhado: instante(11, 9), recebido: instante(11, 13),
          relatos: [{ quando: instante(9, 15), texto: 'Bandeja de condensado trincada. Peça pedida ao fornecedor.' }],
        }],
      },
    },
    {
      predio: P, inspetor: 'carlos', atras: 9, hora: 8, minuto: 45,
      ocorrencias: {
        'Térreo': [{
          tipo: 'ELETRICA', categoria: 'CORRETIVA', prioridade: 'MEDIA',
          descricao: 'Três lâmpadas queimadas na recepção.',
          status: 'AGUARDANDO_FECHAMENTO', responsavel: 'marcos',
          encaminhado: instante(8, 9), recebido: instante(8, 10), terminado: instante(1, 16, 30),
          relatorio: 'Lâmpadas trocadas por LED de 18 W.',
        }],
        '1º Subsolo': [{
          tipo: 'HIGIENIZACAO_LIMPEZA', categoria: 'PREVENTIVA', prioridade: 'BAIXA',
          descricao: 'Poeira acumulada nas grelhas de ventilação.',
          status: 'CONCLUIDO', responsavel: 'marcos',
          encaminhado: instante(8, 9, 30), recebido: instante(8, 11), terminado: instante(6, 15),
          relatorio: 'Grelhas limpas.', fechado: instante(5, 9), custo: 150,
        }],
      },
    },
    {
      predio: P, inspetor: 'ana', atras: 5, hora: 14, minuto: 0,
      ocorrencias: {
        '5º Andar': [{
          tipo: 'INFILTRACAO', categoria: 'CORRETIVA', prioridade: 'MEDIA',
          descricao: 'Mancha de umidade no forro do corredor, perto da escada.',
          status: 'EM_ANDAMENTO', responsavel: 'marcos',
          encaminhado: instante(4, 9), recebido: instante(4, 10),
          nota: 'Conferir a impermeabilização da laje antes de trocar o forro.',
          relatos: [
            { quando: instante(3, 11), texto: 'Forro aberto. A umidade vem de um ralo da área técnica de cima.' },
            { quando: instante(1, 15, 20), texto: 'Ralo desentupido e vedado. Forro secando antes da troca.' },
          ],
        }],
        '1º Andar': [{
          tipo: 'MARCENARIA', categoria: 'CORRETIVA', prioridade: 'MEDIA',
          descricao: 'Porta da copa raspando no batente.',
          status: 'EM_ANDAMENTO', responsavel: 'marcos',
          encaminhado: instante(4, 9, 15), recebido: instante(3, 8),
        }],
      },
    },
    {
      predio: P, inspetor: 'carlos', atras: 2, hora: 8, minuto: 30,
      ocorrencias: {
        '6º Andar': [{
          tipo: 'INFILTRACAO', categoria: 'EMERGENCIAL', prioridade: 'ALTA',
          descricao: 'Infiltração no teto da sala de reuniões, com goteira sobre o projetor.',
          status: 'ABERTO',
        }],
        '3º Andar': [{
          tipo: 'MOVEIS_CADEIRAS', categoria: 'CORRETIVA', prioridade: 'MEDIA',
          descricao: 'Quatro cadeiras com o encosto solto no auditório.',
          status: 'ENCAMINHADO', responsavel: 'marcos', encaminhado: instante(1, 9, 40),
          nota: 'Trocar os parafusos do encosto; se a peça estiver trincada, separar a cadeira.',
        }],
        'Térreo': [{
          tipo: 'CIVIL', categoria: 'PREVENTIVA', prioridade: 'BAIXA',
          descricao: 'Tapete da entrada solto na borda.',
          status: 'ABERTO',
        }],
      },
    },
    {
      predio: P, inspetor: 'ana', atras: 2, hora: 14, minuto: 10,
      ocorrencias: {
        '2º Subsolo': [{
          tipo: 'HIDRELETRICA', categoria: 'CORRETIVA', prioridade: 'ALTA',
          descricao: 'Bomba de recalque fazendo ruído alto e esquentando.',
          status: 'ABERTO',
        }],
        '1º Subsolo': [{
          tipo: 'VAZAMENTO', categoria: 'CORRETIVA', prioridade: 'MEDIA',
          descricao: 'Ralo da garagem entupido, com água empoçada.',
          status: 'EM_ANDAMENTO', responsavel: 'fernando',
          encaminhado: instante(1, 10), recebido: instante(1, 11),
        }],
        '4º Andar': [{
          tipo: 'EQUIPAMENTO', categoria: 'PREVENTIVA', prioridade: 'BAIXA',
          descricao: 'Extintor do corredor com o lacre rompido.',
          status: 'CONCLUIDO', responsavel: 'fernando',
          encaminhado: instante(2, 16), recebido: instante(2, 16, 30), terminado: instante(1, 10, 15),
          relatorio: 'Extintor trocado pela empresa de recarga.', fechado: instante(1, 14), custo: 95,
        }],
      },
    },
    { predio: P, inspetor: 'carlos', atras: 1, hora: 9, minuto: 0, ocorrencias: {} },
    // Anexo: para o seletor de prédio da Beatriz (6.1).
    { predio: PREDIOS_FIXOS.anexo, inspetor: 'ana', atras: 7, hora: 11, ocorrencias: {} },
    { predio: PREDIOS_FIXOS.anexo, inspetor: 'ana', atras: 3, hora: 15, ocorrencias: {} },
  ];
}

const HISTORICO_TIPOS: { tipo: MaintenanceType; descricao: string; relatorio: string }[] = [
  { tipo: 'ELETRICA', descricao: 'Tomada sem energia na sala de apoio.', relatorio: 'Disjuntor substituído.' },
  { tipo: 'PINTURA', descricao: 'Parede marcada no corredor.', relatorio: 'Retoque de pintura feito.' },
  { tipo: 'VAZAMENTO', descricao: 'Torneira do banheiro pingando.', relatorio: 'Reparo da torneira trocado.' },
  { tipo: 'AR_CONDICIONADO', descricao: 'Ar-condicionado sem gelar.', relatorio: 'Gás completado e filtro limpo.' },
  { tipo: 'CIVIL', descricao: 'Piso solto perto da escada.', relatorio: 'Peças de piso reassentadas.' },
  { tipo: 'MARCENARIA', descricao: 'Gaveta do balcão travando.', relatorio: 'Corrediça trocada.' },
  { tipo: 'INFILTRACAO', descricao: 'Mancha de umidade na parede.', relatorio: 'Parede impermeabilizada.' },
  { tipo: 'HIGIENIZACAO_LIMPEZA', descricao: 'Vidros da fachada interna sujos.', relatorio: 'Limpeza feita.' },
  { tipo: 'PROJETOR', descricao: 'Projetor da sala de reuniões sem imagem.', relatorio: 'Cabo HDMI trocado.' },
];

/**
 * O histórico de meses atrás: dias de intensidades diferentes para o
 * calendário (6.1) e chamados finalizados com gasto para o painel (5.4) e o
 * relatório do período (5.5). Determinístico pela semente.
 */
function vistoriasHistoricas(): Vistoria[] {
  const r = prng(20261013);
  const lista: Vistoria[] = [];
  for (let atras = 150; atras >= 20; atras--) {
    const sorteio = r();
    const quantas = sorteio < 0.06 ? 2 : sorteio < 0.4 ? 1 : 0;
    for (let n = 0; n < quantas; n++) {
      const ocorrencias: Record<string, Chamado[]> = {};
      for (const andar of ANDARES_PRINCIPAL) {
        const s = r();
        if (s > 0.28) continue;
        const prioridade: Priority = s < 0.05 ? 'ALTA' : s < 0.17 ? 'MEDIA' : 'BAIXA';
        const modelo = HISTORICO_TIPOS[Math.floor(r() * HISTORICO_TIPOS.length)];
        const responsavel = r() < 0.65 ? 'marcos' : 'fernando';
        const dias = 1 + Math.floor(r() * 6);
        ocorrencias[andar] = [{
          tipo: modelo.tipo,
          categoria: prioridade === 'ALTA' ? 'EMERGENCIAL' : prioridade === 'MEDIA' ? 'CORRETIVA' : 'PREVENTIVA',
          prioridade,
          descricao: modelo.descricao,
          status: 'CONCLUIDO',
          responsavel,
          encaminhado: instante(atras, 16),
          recebido: instante(atras - 1, 9),
          terminado: instante(atras - dias, 15),
          relatorio: modelo.relatorio,
          fechado: instante(atras - dias - 1, 10),
          custo: Math.round((60 + r() * (prioridade === 'ALTA' ? 2400 : 700)) * 100) / 100,
        }];
      }
      lista.push({
        predio: PREDIOS_FIXOS.principal,
        inspetor: r() < 0.5 ? 'carlos' : 'ana',
        atras,
        hora: n === 0 ? 9 : 15,
        minuto: Math.floor(r() * 50),
        ocorrencias,
      });
    }
  }
  // O anexo tem um histórico curto, só para o calendário não ficar vazio.
  for (const atras of [60, 45, 30, 20]) {
    lista.push({ predio: PREDIOS_FIXOS.anexo, inspetor: 'ana', atras, hora: 10, ocorrencias: {} });
  }
  return lista;
}

// ─────────────────────────────────────────────
// RESTAURAR
// ─────────────────────────────────────────────

type Predio = {
  id: string;
  nome: string;
  descricao: string;
  codigo: string;
  dono: Chave;
  andares: string[];
  congelado: boolean;
};

function prediosDoSeed(): Predio[] {
  return [
    {
      id: PREDIOS_FIXOS.principal, nome: 'Edifício Demonstração',
      descricao: 'Prédio fictício para os vídeos tutoriais do Viston.',
      codigo: CODIGOS.principal, dono: 'rafael', andares: ANDARES_PRINCIPAL, congelado: false,
    },
    {
      id: PREDIOS_FIXOS.anexo, nome: 'Edifício Demonstração Anexo',
      descricao: 'Segundo prédio fictício, para o seletor de prédio.',
      codigo: CODIGOS.anexo, dono: 'rafael', andares: ANDARES_ANEXO, congelado: false,
    },
    {
      id: PREDIOS_FIXOS.paula, nome: 'Edifício Demonstração Jardins',
      descricao: 'Prédio fictício inativo, para mostrar o aviso de prédio congelado.',
      codigo: CODIGOS.paula, dono: 'paula', andares: ANDARES_PAULA, congelado: true,
    },
  ];
}

const VINCULOS: { predio: string; conta: Chave; papel: BuildingRole; atras: number }[] = [
  { predio: PREDIOS_FIXOS.principal, conta: 'juliana', papel: 'MODERADOR', atras: 200 },
  { predio: PREDIOS_FIXOS.principal, conta: 'marcos', papel: 'RESPONSAVEL', atras: 198 },
  { predio: PREDIOS_FIXOS.principal, conta: 'fernando', papel: 'RESPONSAVEL', atras: 170 },
  { predio: PREDIOS_FIXOS.principal, conta: 'carlos', papel: 'INSPECTOR', atras: 195 },
  { predio: PREDIOS_FIXOS.principal, conta: 'ana', papel: 'INSPECTOR', atras: 190 },
  { predio: PREDIOS_FIXOS.principal, conta: 'beatriz', papel: 'VIEWER', atras: 180 },
  { predio: PREDIOS_FIXOS.anexo, conta: 'ana', papel: 'INSPECTOR', atras: 90 },
  { predio: PREDIOS_FIXOS.anexo, conta: 'beatriz', papel: 'VIEWER', atras: 90 },
];

export type ResumoDemo = {
  contas: number;
  predios: number;
  andares: number;
  vistorias: number;
  chamados: Record<string, number>;
  atrasados: string[];
  codigo_do_predio: string;
};

/**
 * Volta o escopo demo ao estado inicial. Idempotente.
 *
 * Apaga e recria só o que mora nos prédios demo e nas contas demo. Contas
 * `@viston.demo` criadas durante uma gravação (o cadastro da 1.1 e da 2.1) e
 * prédios criados por gestores demo saem; as do elenco ficam, com o mesmo id.
 */
export async function restaurar(id?: string): Promise<ResumoDemo> {
  const senha = exigirTravas();
  const variacao = (id && VARIACOES[id]) || {};

  const ids = await garantirContas(senha);
  const doElencoUsers = new Set(
    (Object.keys(CONTAS) as Chave[]).filter((k) => CONTAS[k].tipo !== 'gestor').map((k) => ids[k])
  );
  const doElencoManagers = new Set(
    (Object.keys(CONTAS) as Chave[]).filter((k) => CONTAS[k].tipo === 'gestor').map((k) => ids[k])
  );

  const escopo = await lerEscopoDemo(prisma);
  if (escopo.alheios.length) {
    throw new Error(
      ['Restauração recusada: há dados de fora do domínio demo misturados ao escopo.', ...escopo.alheios].join('\n')
    );
  }

  const predios = prediosDoSeed();

  // O código fixo não pode estar com um prédio de fora (chance desprezível, mas
  // upsert por código sequestraria o prédio de alguém).
  const tomados = await prisma.building.findMany({
    where: { share_key: { in: predios.map((p) => p.codigo) }, id: { notIn: IDS_PREDIOS_FIXOS } },
    select: { id: true },
  });
  if (tomados.length) {
    throw new Error(`Restauração recusada: um código fixo do seed já pertence a outro prédio (${tomados.map((t) => t.id).join(', ')}).`);
  }

  const todasDemoUsers = escopo.userIds;
  const todasDemoManagers = escopo.managerIds;
  const extrasUsers = todasDemoUsers.filter((u) => !doElencoUsers.has(u));
  const extrasManagers = todasDemoManagers.filter((m) => !doElencoManagers.has(m));
  const prediosExtras = escopo.buildingIds.filter((b) => !IDS_PREDIOS_FIXOS.includes(b));

  await prisma.$transaction(
    async (tx) => {
      // 1. O que as gravações criaram: prédios novos e contas novas @viston.demo.
      if (prediosExtras.length) {
        await tx.auditLog.deleteMany({ where: { building_id: { in: prediosExtras } } });
        await tx.building.deleteMany({ where: { id: { in: prediosExtras } } });
      }

      // 2. O que mora nas contas demo e não é vínculo de prédio.
      const contasUser = { in: todasDemoUsers };
      const contasManager = { in: todasDemoManagers };
      await tx.auditLog.deleteMany({
        where: {
          OR: [
            { building_id: { in: IDS_PREDIOS_FIXOS } },
            { user_id: contasUser },
            { manager_id: contasManager },
          ],
        },
      });
      await tx.notification.deleteMany({ where: { OR: [{ user_id: contasUser }, { building_id: { in: IDS_PREDIOS_FIXOS } }] } });
      await tx.emailToken.deleteMany({ where: { OR: [{ user_id: contasUser }, { manager_id: contasManager }] } });
      await tx.feedback.deleteMany({ where: { OR: [{ user_id: contasUser }, { manager_id: contasManager }] } });
      await tx.usageCounter.deleteMany({ where: { manager_id: contasManager } });
      await tx.planGrant.deleteMany({ where: { manager_id: contasManager } });
      await tx.buildingOwnershipTransfer.deleteMany({
        where: { OR: [{ building_id: { in: IDS_PREDIOS_FIXOS } }, { from_manager_id: contasManager }, { to_manager_id: contasManager }] },
      });

      // 3. Os prédios fixos, do zero por dentro.
      for (const p of predios) {
        const dono = ids[p.dono];
        await tx.building.upsert({
          where: { id: p.id },
          create: {
            id: p.id, name: p.nome, description: p.descricao, share_key: p.codigo,
            created_by: dono, owner_manager_id: dono, frozen_at: p.congelado ? instante(20, 3) : null,
          },
          update: {
            name: p.nome, description: p.descricao, share_key: p.codigo,
            created_by: dono, owner_manager_id: dono, frozen_at: p.congelado ? instante(20, 3) : null,
          },
        });
        // Primeiro garante o dono, depois tira os outros: o gatilho
        // `building_managers_keep_one` não deixa o prédio sem gestor.
        await tx.buildingManager.upsert({
          where: { building_id_manager_id: { building_id: p.id, manager_id: dono } },
          create: { building_id: p.id, manager_id: dono, joined_at: instante(210, 9) },
          update: { joined_at: instante(210, 9) },
        });
        await tx.buildingManager.deleteMany({ where: { building_id: p.id, manager_id: { not: dono } } });
        if (p.id === PREDIOS_FIXOS.principal && !variacao.semHelena) {
          await tx.buildingManager.create({
            data: { building_id: p.id, manager_id: ids.helena, joined_at: instante(120, 9) },
          });
        }

        await tx.inspectionSchedule.deleteMany({ where: { building_id: p.id } });
        await tx.inspectionReport.deleteMany({ where: { building_id: p.id } });
        await tx.buildingShareToken.deleteMany({ where: { building_id: p.id } });
        await tx.buildingAccessRequest.deleteMany({ where: { building_id: p.id } });
        await tx.buildingMember.deleteMany({ where: { building_id: p.id } });
        await tx.floor.deleteMany({ where: { building_id: p.id, label: { notIn: p.andares } } });
        for (const label of p.andares) {
          await tx.floor.upsert({
            where: { building_id_label: { building_id: p.id, label } },
            create: { building_id: p.id, label },
            update: {},
          });
        }
      }

      // Contas @viston.demo de fora do elenco (criadas numa gravação). Depois
      // dos prédios, para o dono de cada um já estar garantido no vínculo.
      if (extrasUsers.length) await tx.user.deleteMany({ where: { id: { in: extrasUsers } } });
      if (extrasManagers.length) await tx.manager.deleteMany({ where: { id: { in: extrasManagers } } });

      // 4. Plano: Rafael no Pro por concessão (sem Stripe); Paula fica no Livre.
      await tx.planGrant.create({
        data: { manager_id: ids.rafael, plan: 'PRO', reason: 'Conta de demonstração dos vídeos tutoriais', starts_at: instante(210, 9) },
      });

      // 5. Equipe e pedidos de acesso.
      await tx.buildingMember.createMany({
        data: VINCULOS.map((v) => ({ building_id: v.predio, user_id: ids[v.conta], role: v.papel, joined_at: instante(v.atras, 10) })),
      });
      await tx.buildingAccessRequest.createMany({
        data: [
          ...(variacao.semPedidoDoLucas
            ? []
            : [{ building_id: PREDIOS_FIXOS.principal, user_id: ids.lucas, status: 'PENDING', requested_at: instante(1, 18, 20) }]),
          { building_id: PREDIOS_FIXOS.principal, user_id: ids.pedro, status: 'PENDING', requested_at: instante(0, 8, 5) },
        ],
      });

      // 6. Vistorias e chamados.
      const andares = await tx.floor.findMany({
        where: { building_id: { in: IDS_PREDIOS_FIXOS } },
        select: { id: true, label: true, building_id: true },
      });
      const andarId = new Map(andares.map((a) => [`${a.building_id}|${a.label}`, a.id]));

      const relatorios: Prisma.InspectionReportCreateManyInput[] = [];
      const entradas: Prisma.FloorFormEntryCreateManyInput[] = [];
      const chamados: Prisma.MaintenanceRecordCreateManyInput[] = [];
      const relatos: Prisma.TicketUpdateCreateManyInput[] = [];

      for (const v of [...vistoriasHistoricas(), ...vistoriasRecentes()]) {
        const labels = v.predio === PREDIOS_FIXOS.anexo ? ANDARES_ANEXO : ANDARES_PRINCIPAL;
        const fim = instante(v.atras, v.hora, v.minuto ?? 0);
        const reportId = randomUUID();
        const floorIds = labels.map((l) => andarId.get(`${v.predio}|${l}`)!);
        relatorios.push({
          id: reportId,
          inspector_id: ids[v.inspetor],
          building_id: v.predio,
          date: dia(v.atras),
          started_at: new Date(fim.getTime() - 40 * 60_000),
          finished_at: fim,
          floors_inspected: floorIds,
          status: 'COMPLETED',
          origin: 'VISTORIA',
          created_at: fim,
        });
        labels.forEach((label, i) => {
          const lista = v.ocorrencias[label] ?? [];
          const entryId = randomUUID();
          entradas.push({ id: entryId, report_id: reportId, floor_id: floorIds[i], status_geral: situacao(lista), completed_at: fim });
          for (const c of lista) {
            const ticketId = randomUUID();
            const resp = c.responsavel ? { id: ids[c.responsavel], nome: CONTAS[c.responsavel].nome } : null;
            chamados.push({
              id: ticketId,
              floor_form_entry_id: entryId,
              maintenance_type: c.tipo,
              category: c.categoria,
              priority: c.prioridade,
              description: c.descricao,
              responsible: resp?.nome ?? null,
              responsible_id: resp?.id ?? null,
              status: c.status,
              forwarded_at: c.encaminhado ?? null,
              received_at: c.recebido ?? null,
              done_at: c.terminado ?? null,
              done_report: c.relatorio ?? null,
              closed_at: c.fechado ?? null,
              closed_by_id: c.fechado ? ids.juliana : null,
              maintenance_note: c.nota ?? null,
              maintenance_cost: c.custo ?? null,
              created_at: fim,
            });
            for (const rel of c.relatos ?? []) {
              relatos.push({
                ticket_id: ticketId,
                author_id: resp?.id ?? null,
                author_name: resp?.nome ?? CONTAS.juliana.nome,
                description: rel.texto,
                photos: [],
                created_at: rel.quando,
              });
            }
          }
        });
      }

      await tx.inspectionReport.createMany({ data: relatorios });
      await tx.floorFormEntry.createMany({ data: entradas });
      await tx.maintenanceRecord.createMany({ data: chamados });
      if (relatos.length) await tx.ticketUpdate.createMany({ data: relatos });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );

  return resumo();
}

/** Contagens do escopo demo, para conferir depois de rodar. */
export async function resumo(): Promise<ResumoDemo> {
  const escopo = await lerEscopoDemo(prisma);
  const noEscopo = { floor_form_entry: { report: { building_id: { in: escopo.buildingIds } } } };
  const [andares, vistorias, porStatus, abertos] = await Promise.all([
    prisma.floor.count({ where: { building_id: { in: escopo.buildingIds } } }),
    prisma.inspectionReport.count({ where: { building_id: { in: escopo.buildingIds } } }),
    prisma.maintenanceRecord.groupBy({ by: ['status'], where: noEscopo, _count: { _all: true } }),
    prisma.maintenanceRecord.findMany({
      where: { ...noEscopo, status: { not: 'CONCLUIDO' } },
      select: { description: true, priority: true, closed_at: true, floor_form_entry: { select: { report: { select: { date: true } } } } },
    }),
  ]);
  // O mesmo cálculo de prazo das telas (`src/utils/sla.ts`).
  const atrasados = abertos.filter(
    (a) => computeSla({ priority: a.priority, openedOn: a.floor_form_entry.report.date, closedAt: a.closed_at }).atrasado
  );
  const chamados: Record<string, number> = {};
  for (const s of porStatus) chamados[s.status] = s._count._all;
  return {
    contas: escopo.userIds.length + escopo.managerIds.length,
    predios: escopo.buildingIds.length,
    andares,
    vistorias,
    chamados,
    atrasados: atrasados.map((a) => a.description),
    codigo_do_predio: CODIGOS.principal.replace(/(.{4})(?=.)/g, '$1-'),
  };
}

// ─────────────────────────────────────────────
// IMAGENS DE EXEMPLO
// ─────────────────────────────────────────────

/**
 * Duas fotos de exemplo para a ocorrência avulsa (4.4), desenhadas por código:
 * sem direitos de terceiros. Vão para `tutoriais/esteira/fotos/`, que a
 * gravação passa ao seletor de arquivos com `setInputFiles`. Não sobem para o
 * storage: quem sobe é o próprio app, durante a gravação.
 */
export function gerarFotosDeExemplo(pasta = path.resolve(__dirname, '..', '..', 'tutoriais', 'esteira', 'fotos')): string[] {
  fs.mkdirSync(pasta, { recursive: true });
  const fotos: [string, (x: number, y: number) => [number, number, number]][] = [
    // Teto claro com uma mancha de umidade amarronzada.
    ['infiltracao-teto.png', (x, y) => {
      const base = 228 - Math.floor(y / 60) * 2;
      const d = Math.hypot((x - 420) / 1.4, y - 260);
      const borda = Math.sin(x / 23) * 12 + Math.cos(y / 17) * 10;
      if (d < 150 + borda) {
        const k = Math.min(1, (150 + borda - d) / 90);
        return [Math.round(base - 70 * k), Math.round(base - 85 * k), Math.round(base - 120 * k)];
      }
      if ((x % 200 < 2) || (y % 200 < 2)) return [base - 25, base - 25, base - 25];
      return [base, base - 2, base - 6];
    }],
    // Porta de madeira com o batente e uma marca de raspado.
    ['porta-copa.png', (x, y) => {
      if (x < 180 || x > 620) return [214, 210, 200];
      if (x < 200 || x > 600 || y < 40) return [240, 238, 232];
      if (x > 560 && x < 600 && y > 360 && y < 420) return [196, 160, 120];
      const veio = Math.sin((y + Math.sin(x / 40) * 30) / 9) * 10;
      if (x > 540 && x < 560 && y > 300 && y < 330) return [190, 190, 190];
      return [Math.round(150 + veio), Math.round(98 + veio), Math.round(58 + veio / 2)];
    }],
  ];
  const caminhos: string[] = [];
  for (const [nome, pixel] of fotos) {
    const caminho = path.join(pasta, nome);
    caminhos.push(caminho);
    if (fs.existsSync(caminho)) continue;
    fs.writeFileSync(caminho, png(800, 600, pixel));
  }
  return caminhos;
}

function png(largura: number, altura: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const linha = largura * 3 + 1;
  const bruto = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y++) {
    bruto[y * linha] = 0;
    for (let x = 0; x < largura; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * linha + 1 + x * 3;
      bruto[o] = r; bruto[o + 1] = g; bruto[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(bruto)),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  let crc = 0xffffffff;
  for (const byte of corpo) crc = TABELA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const fim = Buffer.alloc(4);
  fim.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([tamanho, corpo, fim]);
}

// ─────────────────────────────────────────────
// LINHA DE COMANDO
// ─────────────────────────────────────────────

async function main() {
  const i = process.argv.indexOf('--so');
  const id = i >= 0 ? process.argv[i + 1] : undefined;
  console.log(`Banco: ${hostDoBanco(process.env.DATABASE_URL)}${id ? ` · variação: ${id}` : ''}`);
  exigirTravas();
  const fotos = gerarFotosDeExemplo();
  const r = await restaurar(id);
  console.log(JSON.stringify({ ...r, fotos_de_exemplo: fotos.map((f) => path.relative(process.cwd(), f)) }, null, 2));
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { prisma };
