import { clearDraft, loadDraft, saveDraft } from '@/app/lib/draft';

/**
 * O rascunho da vistoria.
 *
 * É a rede que segura quarenta minutos de trabalho quando o navegador descarta
 * a aba no 18º andar. Os casos abaixo são os que fazem a rede não segurar:
 * rascunho velho demais, rascunho ilegível, e o armazenamento recusando escrita.
 */
beforeEach(() => localStorage.clear());

describe('rascunho da vistoria', () => {
  const rascunho = {
    floors: [{ id: 'a', label: '1º Andar' }],
    drafts: { a: [] },
    current_index: 0,
    submission_key: 'chave-1',
  };

  it('guarda e devolve o que estava preenchido', () => {
    saveDraft('predio-1', rascunho);

    const lido = loadDraft('predio-1');
    expect(lido.floors).toHaveLength(1);
    expect(lido.submission_key).toBe('chave-1');
  });

  it('separa por prédio', () => {
    saveDraft('predio-1', rascunho);
    expect(loadDraft('predio-2')).toBeNull();
  });

  it('descarta rascunho de mais de um dia', () => {
    // Uma vistoria dura uma manhã. Oferecer a retomada de anteontem é pior do
    // que não oferecer nada: a pessoa aceita e não reconhece o que aparece.
    saveDraft('predio-1', rascunho);
    const guardado = JSON.parse(localStorage.getItem('viston:vistoria:predio-1'));
    guardado.saved_at = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem('viston:vistoria:predio-1', JSON.stringify(guardado));

    expect(loadDraft('predio-1')).toBeNull();
    // E some de vez, para não ser reavaliado a cada abertura.
    expect(localStorage.getItem('viston:vistoria:predio-1')).toBeNull();
  });

  it('descarta rascunho ilegível em vez de travar a tela', () => {
    localStorage.setItem('viston:vistoria:predio-1', '{isto não é json');
    expect(loadDraft('predio-1')).toBeNull();
  });

  it('ignora rascunho sem andar nenhum', () => {
    saveDraft('predio-1', { floors: [], drafts: {}, current_index: 0 });
    expect(loadDraft('predio-1')).toBeNull();
  });

  it('sai do caminho quando o armazenamento recusa a escrita', () => {
    // Safari em navegação privada, cota estourada: guardar o rascunho não pode
    // derrubar a vistoria que está sendo preenchida.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };

    expect(() => saveDraft('predio-1', rascunho)).not.toThrow();

    Storage.prototype.setItem = original;
  });

  it('some quando a vistoria é enviada', () => {
    saveDraft('predio-1', rascunho);
    clearDraft('predio-1');
    expect(loadDraft('predio-1')).toBeNull();
  });
});
