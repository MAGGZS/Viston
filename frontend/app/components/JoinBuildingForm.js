'use client';
import { useState } from 'react';
import { Button } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useBuildingByKey, useRequestAccess } from '@/app/hooks/useApi';
import { formatShareKey, normalizeShareKey, isCompleteShareKey } from '@/app/lib/shareKey';
import { T, W } from '@/app/lib/theme';

/**
 * Entrada da chave do prédio: busca pelo código e pede acesso.
 *
 * Mora em três telas (home, visualização e perfil) porque é a única saída de
 * quem entrou no sistema e ainda não tem prédio — deixar isso só no perfil
 * escondia o caminho justamente de quem precisa dele.
 */
export function JoinBuildingForm({ align = 'left' }) {
  const [keyInput, setKeyInput] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [requested, setRequested] = useState(false);

  const { data: building, isLoading, error } = useBuildingByKey(searchKey);
  const requestAccess = useRequestAccess();
  const { show: toast } = useToastStore();

  function handleSearch() {
    const key = normalizeShareKey(keyInput);
    if (!isCompleteShareKey(key)) {
      toast('Chave inválida. Ela tem 12 caracteres.', 'error');
      return;
    }
    setSearchKey(key);
    setRequested(false);
  }

  async function handleRequestAccess() {
    try {
      await requestAccess.mutateAsync(searchKey);
      setRequested(true);
      toast('Solicitação enviada! Aguarde a aprovação.', 'success');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao solicitar acesso', 'error');
    }
  }

  if (requested) {
    return (
      <div className="anim-scale-in" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 14, padding: 14, textAlign: 'center' }}>
        <p style={{ color: '#4ade80', fontWeight: W.title, fontSize: 14 }}>Solicitação enviada!</p>
        <p style={{ color: T.mute, fontSize: 12, marginTop: 4 }}>Aguarde a aprovação do gestor do prédio.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: align }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{
            flex: 1, background: T.chip, borderRadius: 16, padding: '11px 14px',
            color: T.text, fontSize: 13, outline: 'none', fontWeight: W.title,
            letterSpacing: '0.18em', border: 'none', minWidth: 0,
          }}
          placeholder="ABCD-EFGH-JKMN"
          maxLength={14}
          aria-label="Chave do prédio"
          value={keyInput}
          onChange={e => setKeyInput(formatShareKey(e.target.value))}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <Button variant="secondary" onClick={handleSearch}>Buscar</Button>
      </div>

      {isLoading && <p className="anim-fade-in" style={{ color: T.faint, fontSize: 13 }}>Buscando...</p>}
      {error && <p className="anim-fade-in" style={{ color: T.danger, fontSize: 13 }}>Chave inválida ou prédio não encontrado</p>}

      {building && (
        <div className="anim-fade-up" style={{ background: T.chip, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ color: T.text, fontWeight: W.title, fontSize: 14, textAlign: 'left' }}>{building.name}</p>
          <Button onClick={handleRequestAccess} loading={requestAccess.isPending} style={{ fontSize: 12, padding: '6px 14px' }}>
            Conectar-se
          </Button>
        </div>
      )}
    </div>
  );
}
