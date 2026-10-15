import {
  conferirMp4,
  dividirFrases,
  estimarInicios,
  falasCronometradas,
  falasDoTrecho,
  gerarLegendaVtt,
  indiceDaFala,
  montarPacoteDeTexto,
  quebrarEmFalas,
  tempoVtt,
} from '@/app/lib/pacoteDoVideo';
import { indiceDaAbaNoTempo, progressoDaAba } from '@/app/lib/ajuda';

// As abas do pacote de exemplo tutoriais/videos/03-inspetor/inspetor-vistoria-completa,
// como o admin as recebe da API (o texto da aba é a narração do roteiro).
const NARRACOES = [
  ['Começar', 'A vistoria é feita andando pelo prédio, com o celular na mão. Na tela inicial, toque em Nova vistoria.'],
  ['Escolher os andares', 'Marque os andares que você vai percorrer hoje. Não precisa ser o prédio inteiro. O Viston organiza do andar mais alto para o mais baixo.'],
  ['Andar sem problema', 'Andar sem nada a registrar? Marque Nada a relatar neste andar e toque em Próximo andar. É o caminho mais comum.'],
  ['Registrar uma ocorrência', 'Encontrou algo? Escolha o tipo de manutenção, se ela é corretiva ou preventiva, a prioridade e descreva o que viu. O responsável pode ficar em branco: o moderador encaminha depois.'],
  ['Mais de uma ocorrência no andar', 'Se houver mais de um problema no mesmo andar, toque em Adicionar ocorrência. Cada uma vira um chamado separado.'],
  ['Se faltou algo', 'Se faltar algum campo, o Viston aponta qual é e não deixa avançar. Corrija e siga.'],
  ['Voltar a um andar', 'Pode voltar a qualquer andar já feito. O que você preencheu continua lá.'],
  ['Enviar', 'No último andar, o botão muda para Enviar vistoria. Ao enviar, ela vira relatório, planilha, entra no calendário e no histórico, e os chamados chegam ao moderador.'],
];

const FEATURE = {
  id: 'f1',
  slug: 'inspetor-vistoria-completa',
  title: 'Fazer uma vistoria completa',
  folder: { slug: 'inspetor', title: 'Inspetor' },
  catalog_script_hash: '22999058750c9d785c923a7c303bc401b7e65cfac2d1d64df5303d63ca919ea5',
  steps: NARRACOES.map(([title, body], i) => ({ id: `s${i + 1}`, order: i + 1, title, body, start_s: null })),
};

describe('frases e falas da legenda', () => {
  it('divide a narração em frases', () => {
    expect(dividirFrases('Andar sem nada a registrar? Marque Nada a relatar.  É o caminho mais comum.')).toEqual([
      'Andar sem nada a registrar?',
      'Marque Nada a relatar.',
      'É o caminho mais comum.',
    ]);
    expect(dividirFrases('   ')).toEqual([]);
  });

  it('quebra a frase em falas de até 2 linhas de até 42 caracteres', () => {
    const frase = 'Escolha o tipo de manutenção, se ela é corretiva ou preventiva, a prioridade e descreva o que viu.';
    const falas = quebrarEmFalas(frase);
    expect(falas.length).toBeGreaterThan(1);
    falas.forEach((linhas) => {
      expect(linhas.length).toBeLessThanOrEqual(2);
      linhas.forEach((l) => expect(l.length).toBeLessThanOrEqual(42));
    });
    expect(falas.flat().join(' ')).toBe(frase);
  });

  it('palavra maior que a linha é cortada no limite', () => {
    const falas = quebrarEmFalas(`ver ${'x'.repeat(50)}`);
    falas.flat().forEach((l) => expect(l.length).toBeLessThanOrEqual(42));
  });
});

describe('inícios estimados', () => {
  it('a primeira em 0, as outras na proporção dos caracteres', () => {
    expect(estimarInicios(['aaaa', 'aaaa', 'aaaaaaaa'], 16)).toEqual([0, 4, 8]);
  });

  it('crescentes e antes do fim do vídeo', () => {
    const inicios = estimarInicios(NARRACOES.map(([, b]) => b), 62.6);
    expect(inicios[0]).toBe(0);
    inicios.forEach((t, i) => {
      if (i > 0) expect(t).toBeGreaterThan(inicios[i - 1]);
      expect(t).toBeLessThan(62.6);
    });
  });
});

describe('montarPacoteDeTexto', () => {
  it('gera o passos.json no formato do contrato, com o hash do catálogo', () => {
    const r = montarPacoteDeTexto(FEATURE, 62.6);
    expect(r.ok).toBe(true);
    expect(r.passos).toMatchObject({
      pasta: 'inspetor',
      id: 'inspetor-vistoria-completa',
      script_hash: FEATURE.catalog_script_hash,
      duracao_s: 62.6,
    });
    expect(r.passos.abas).toHaveLength(8);
    expect(r.passos.abas[0]).toEqual({ ordem: 1, titulo: 'Começar', texto: NARRACOES[0][1], inicio_s: 0 });
    expect(r.passos.abas.map((a) => a.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Perto dos tempos reais da esteira (7,12 s e 51,28 s), que é o que a
    // estimativa promete: um ponto de partida, a conferir.
    expect(Math.abs(r.passos.abas[1].inicio_s - 7.12)).toBeLessThan(2);
    expect(Math.abs(r.passos.abas[7].inicio_s - 51.28)).toBeLessThan(5);
  });

  it('gera a legenda.vtt com uma fala por frase nos tempos dos passos', () => {
    const r = montarPacoteDeTexto(FEATURE, 62.6);
    const linhas = r.vtt.split('\n');
    expect(linhas[0]).toBe('WEBVTT');
    const tempos = r.vtt.match(/^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/gm);
    expect(tempos.length).toBeGreaterThanOrEqual(20);
    expect(tempos[0].startsWith('00:00:00.000 -->')).toBe(true);
    expect(tempos.at(-1).endsWith('--> 00:01:02.600')).toBe(true);
    // Cada fala começa onde a anterior acabou e termina depois de começar.
    let fimAnterior = 0;
    tempos.forEach((t) => {
      const [de, ate] = t.split(' --> ').map((x) => {
        const [h, m, s] = x.split(':');
        return Number(h) * 3600 + Number(m) * 60 + Number(s);
      });
      expect(ate).toBeGreaterThan(de);
      expect(de).toBeCloseTo(fimAnterior, 3);
      fimAnterior = ate;
    });
    // Texto: até 42 caracteres e 2 linhas por fala.
    r.vtt.split('\n\n').slice(1).forEach((bloco) => {
      const texto = bloco.split('\n').slice(2);
      expect(texto.length).toBeLessThanOrEqual(2);
      texto.forEach((l) => expect(l.length).toBeLessThanOrEqual(42));
    });
    // A segunda aba começa numa fala nova.
    expect(r.vtt).toContain(`${tempoVtt(r.inicios[1])} -->`);
  });

  it('recusa sem hash do catálogo, sem duração ou acima de 10 minutos', () => {
    expect(montarPacoteDeTexto({ ...FEATURE, catalog_script_hash: null }, 60).ok).toBe(false);
    expect(montarPacoteDeTexto(FEATURE, NaN).ok).toBe(false);
    expect(montarPacoteDeTexto(FEATURE, 601).erro).toMatch(/10 minutos/);
  });

  it('tempoVtt e gerarLegendaVtt', () => {
    expect(tempoVtt(67.12)).toBe('00:01:07.120');
    expect(gerarLegendaVtt([{ inicio: 0, fim: 1.5, linhas: ['Oi.'] }])).toBe('WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\nOi.\n');
  });
});

describe('conferirMp4', () => {
  const mp4 = (...marcas) => {
    const cabeca = [0, 0, 0, 24, ...'ftypisom'.split('').map((c) => c.charCodeAt(0))];
    return new Uint8Array([...cabeca, ...marcas.flatMap((m) => m.split('').map((c) => c.charCodeAt(0)))]);
  };

  it('passa H.264 com AAC', () => {
    expect(conferirMp4(mp4('moov', 'avc1', 'mp4a'))).toBeNull();
  });

  it('recusa o que não é MP4, o que não é H.264 e o que não tem AAC', () => {
    expect(conferirMp4(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toMatch(/não é um vídeo MP4/);
    expect(conferirMp4(mp4('hev1', 'mp4a'))).toMatch(/H\.264/);
    expect(conferirMp4(mp4('avc1', 'Opus'))).toMatch(/AAC/);
  });
});

describe('o passo a passo no tempo do vídeo', () => {
  const steps = [{ start_s: 0 }, { start_s: 9.4 }, { start_s: 18 }, { start_s: 30 }];

  it('o passo ativo avança com o tempo', () => {
    expect(indiceDaAbaNoTempo(steps, 0)).toBe(0);
    expect(indiceDaAbaNoTempo(steps, 9.39)).toBe(1); // folga de 50 ms
    expect(indiceDaAbaNoTempo(steps, 17.9)).toBe(1);
    expect(indiceDaAbaNoTempo(steps, 18)).toBe(2);
    expect(indiceDaAbaNoTempo(steps, 59)).toBe(3);
  });

  it('o progresso do passo vai de 0 a 1 até o próximo', () => {
    expect(progressoDaAba(steps, 2, 18, 40)).toBe(0);
    expect(progressoDaAba(steps, 2, 24, 40)).toBe(0.5);
    expect(progressoDaAba(steps, 3, 40, 40)).toBe(1);
  });

  it('as falas do trecho e a fala dita agora', () => {
    const falas = falasCronometradas(['Um. Dois.', 'Três.'], [0, 10], 20);
    const doPrimeiro = falasDoTrecho(falas, 0, 10);
    expect(doPrimeiro.map((f) => f.texto)).toEqual(['Um.', 'Dois.']);
    expect(indiceDaFala(doPrimeiro, 1)).toBe(0);
    expect(indiceDaFala(doPrimeiro, 6)).toBe(1);
    expect(falasDoTrecho(falas, 10, undefined).map((f) => f.texto)).toEqual(['Três.']);
  });
});
