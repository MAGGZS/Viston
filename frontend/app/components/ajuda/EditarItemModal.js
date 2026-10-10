'use client';
import { useState } from 'react';
import { Button, Input, Modal, Textarea } from '@/app/components/ui';
import { useUpdateHelpFeatureById, useUpdateHelpFolder } from '@/app/hooks/useAjuda';
import { mensagemDoErro } from '@/app/lib/erros';
import { useToastStore } from '@/app/store/toast';
import { T } from '@/app/lib/theme';

/**
 * Editar título e resumo (funcionalidade) ou título e descrição (pasta).
 *
 * Uma caixa só para os dois casos: os campos são os mesmos dois, e o que muda
 * é o nome do segundo e o limite. Os limites repetem os do servidor só para o
 * contador não deixar a pessoa escrever o que ele vai recusar.
 */
export function EditarItemModal({ editando, onClose }) {
  const aberto = Boolean(editando);
  const ehPasta = editando?.tipo === 'pasta';
  return (
    <Modal open={aberto} onClose={onClose} title={ehPasta ? 'Editar pasta' : 'Editar funcionalidade'} maxWidth={480}>
      {editando && <FormularioDeEdicao key={editando.item.id} editando={editando} onClose={onClose} />}
    </Modal>
  );
}

function FormularioDeEdicao({ editando, onClose }) {
  const ehPasta = editando.tipo === 'pasta';
  const item = editando.item;
  const [titulo, setTitulo] = useState(item.title ?? '');
  const [texto, setTexto] = useState((ehPasta ? item.description : item.summary) ?? '');
  const [erro, setErro] = useState(null);
  const pasta = useUpdateHelpFolder();
  const feature = useUpdateHelpFeatureById();
  const { show: toast } = useToastStore();
  const salvando = pasta.isPending || feature.isPending;

  const salvar = async (e) => {
    e.preventDefault();
    setErro(null);
    if (!titulo.trim()) {
      setErro({ campo: 'titulo', msg: 'O título não pode ficar vazio.' });
      return;
    }
    if (ehPasta && !texto.trim()) {
      setErro({ campo: 'texto', msg: 'A descrição não pode ficar vazia.' });
      return;
    }
    try {
      if (ehPasta) await pasta.mutateAsync({ id: item.id, title: titulo.trim(), description: texto.trim() });
      else await feature.mutateAsync({ id: item.id, title: titulo.trim(), summary: texto.trim() || null });
      toast(ehPasta ? 'Pasta atualizada' : 'Funcionalidade atualizada');
      onClose();
    } catch (err) {
      const detalhe = err?.response?.data?.error?.details?.[0]?.path;
      setErro({ campo: detalhe === 'title' ? 'titulo' : detalhe ? 'texto' : 'geral', msg: mensagemDoErro(err) });
    }
  };

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
      <Input
        label="Título"
        value={titulo}
        maxLength={120}
        onChange={(e) => setTitulo(e.target.value)}
        error={erro?.campo === 'titulo' ? erro.msg : undefined}
      />
      <Textarea
        label={ehPasta ? 'Descrição' : 'Resumo (opcional)'}
        rows={3}
        maxLength={300}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        error={erro?.campo === 'texto' ? erro.msg : undefined}
        hint={`${texto.length} de 300 caracteres`}
      />
      {erro?.campo === 'geral' && <p role="alert" style={{ color: T.danger, fontSize: 13 }}>{erro.msg}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" style={{ flex: 1 }} onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button type="submit" style={{ flex: 1 }} loading={salvando}>Salvar</Button>
      </div>
    </form>
  );
}
