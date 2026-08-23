'use client';
import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button, Modal, Select } from '@/app/components/ui';
import { useTicketReport } from '@/app/hooks/useApi';
import { useToastStore } from '@/app/store/toast';
import { T, R } from '@/app/lib/theme';

/**
 * A escolha do período do relatório.
 *
 * O servidor recebe duas datas e mais nada — mês, semestre e ano são conforto
 * de quem pede, não conceito do domínio. Traduzir aqui mantém a regra de
 * calendário num lugar só e permite acrescentar um atalho novo sem tocar na API.
 *
 * As datas são montadas como texto 'AAAA-MM-DD', sem passar por `Date`: o mês
 * escolhido é um dia do calendário, e convertê-lo para instante o deslocaria
 * para o dia anterior em qualquer fuso a oeste de Greenwich.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const TIPOS = [
  { value: 'MES', label: 'Um mês' },
  { value: 'SEMESTRE', label: 'Um semestre' },
  { value: 'ANO', label: 'Um ano inteiro' },
  { value: 'INTERVALO', label: 'De uma data a outra' },
];

const pad = (n) => String(n).padStart(2, '0');

/** Último dia do mês, sem tabela: o dia 0 do mês seguinte. */
function ultimoDia(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function periodoDe(tipo, { year, month, semestre, from, to }) {
  if (tipo === 'MES') {
    return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(ultimoDia(year, month))}` };
  }
  if (tipo === 'SEMESTRE') {
    return semestre === 1
      ? { from: `${year}-01-01`, to: `${year}-06-30` }
      : { from: `${year}-07-01`, to: `${year}-12-31` };
  }
  if (tipo === 'ANO') {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  return { from, to };
}

const inputStyle = {
  background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
  borderRadius: R.control, padding: '11px 14px', color: T.text, fontSize: 14,
  outline: 'none', width: '100%', fontFamily: 'inherit',
};

export function RelatorioModal({ buildingId, open, onClose }) {
  const relatorio = useTicketReport();
  const { show: toast } = useToastStore();

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();

  const [tipo, setTipo] = useState('MES');
  const [year, setYear] = useState(anoAtual);
  const [month, setMonth] = useState(hoje.getMonth() + 1);
  const [semestre, setSemestre] = useState(hoje.getMonth() < 6 ? 1 : 2);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [erro, setErro] = useState(null);

  // Cinco anos para trás cobre o histórico de um prédio sem virar uma lista
  // que se rola; ninguém pede relatório de manutenção da década passada.
  const anos = useMemo(
    () => Array.from({ length: 6 }, (_, i) => anoAtual - i),
    [anoAtual]
  );

  async function handleGerar() {
    const periodo = periodoDe(tipo, { year, month, semestre, from, to });

    if (!periodo.from || !periodo.to) {
      setErro('Escolha as duas datas do intervalo');
      return;
    }
    if (periodo.from > periodo.to) {
      setErro('A data inicial não pode ser depois da final');
      return;
    }

    try {
      await relatorio.mutateAsync({ buildingId, from: periodo.from, to: periodo.to });
      toast('Relatório gerado', 'success');
      onClose();
    } catch (e) {
      setErro(e?.response?.data?.error?.message || 'Erro ao gerar o relatório');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerar relatório" maxWidth={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: T.mute, fontSize: 12, lineHeight: 1.6 }}>
          O documento lista as manutenções finalizadas no período, com o gasto total no fim.
        </p>

        <Select
          label="Período"
          options={TIPOS}
          value={tipo}
          onChange={(e) => { setTipo(e.target.value); setErro(null); }}
        />

        {tipo === 'MES' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
            <Select
              label="Mês"
              options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
              value={String(month)}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
            <Select
              label="Ano"
              options={anos.map((a) => ({ value: String(a), label: String(a) }))}
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        )}

        {tipo === 'SEMESTRE' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
            <Select
              label="Semestre"
              options={[
                { value: '1', label: '1º semestre (jan–jun)' },
                { value: '2', label: '2º semestre (jul–dez)' },
              ]}
              value={String(semestre)}
              onChange={(e) => setSemestre(Number(e.target.value))}
            />
            <Select
              label="Ano"
              options={anos.map((a) => ({ value: String(a), label: String(a) }))}
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        )}

        {tipo === 'ANO' && (
          <Select
            label="Ano"
            options={anos.map((a) => ({ value: String(a), label: String(a) }))}
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        )}

        {tipo === 'INTERVALO' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ color: T.mute, fontSize: 12 }}>De</span>
              <input
                type="date"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setErro(null); }}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ color: T.mute, fontSize: 12 }}>Até</span>
              <input
                type="date"
                value={to}
                onChange={(e) => { setTo(e.target.value); setErro(null); }}
                style={inputStyle}
              />
            </label>
          </div>
        )}

        {erro && <p role="alert" style={{ color: T.danger, fontSize: 12 }}>{erro}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button onClick={handleGerar} loading={relatorio.isPending} style={{ flex: 1 }}>
            <FileText size={15} /> Gerar .docx
          </Button>
        </div>
      </div>
    </Modal>
  );
}
