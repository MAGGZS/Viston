'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Share2 } from 'lucide-react';
import { RouteGuard } from '@/app/components/RouteGuard';
import { GestorHeader } from '@/app/components/GestorHeader';
import { CreateBuildingModal, EditBuildingModal } from '@/app/components/BuildingFormModals';
import { Button, Modal } from '@/app/components/ui';
import { useToastStore } from '@/app/store/toast';
import { useManagedBuildings, useDeleteBuilding } from '@/app/hooks/useApi';
import { useExitTransition, useKeepWhileClosing } from '@/app/hooks/useExitTransition';
import { formatShareKey } from '@/app/lib/shareKey';
import { T, R, W } from '@/app/lib/theme';
import { CONTENT_ID } from '@/app/components/mobile/kit';

const CARD_WIDTH = 320;

/**
 * Botão de criar prédio.
 *
 * É o centro da tela enquanto não existe nenhum prédio, e vira mais um bloco da
 * fileira depois — por isso ele tem o tamanho do cartão, e não o de um botão
 * comum: o gesto de criar continua no mesmo lugar do olhar.
 */
function CreateTile({ onClick, standalone, className = '' }) {
  return (
    <button
      onClick={onClick}
      // O grupo é o que deixa o "+" girar junto com o realce da borda: um gesto
      // só, em vez de dois efeitos disputando atenção.
      className={`group transition-all duration-200 hover:-translate-y-1 ${className}`}
      style={{
        width: CARD_WIDTH,
        minHeight: standalone ? 190 : 172,
        background: 'transparent',
        border: `1px dashed ${T.line}`,
        borderRadius: R.card,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accentSoft; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        className="transition-transform duration-300 group-hover:rotate-90 group-hover:scale-110"
        style={{
          width: 56, height: 56, borderRadius: '50%', background: T.accent, color: T.onAccent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Plus size={26} strokeWidth={2.4} />
      </span>
      <span style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 15, color: T.text }}>
        Criar prédio
      </span>
      {standalone && (
        <span style={{ color: T.mute, fontSize: 14, maxWidth: 220, lineHeight: 1.5 }}>
          Cadastre o prédio e os andares para começar a receber vistorias
        </span>
      )}
    </button>
  );
}

function BuildingCard({ building, onOpen, onShare, onEdit, onDelete, className = '' }) {
  return (
    <div
      className={`transition-all duration-200 hover:-translate-y-1 ${className}`}
      style={{
        width: CARD_WIDTH, background: T.card, borderRadius: R.card, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 16, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {building.name}
        </p>
        {building.description && (
          <p style={{ color: T.mute, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{building.description}</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button
          onClick={onOpen}
          className="transition-colors duration-150 hover:bg-accent-hover"
          style={{
            flex: 1, background: T.accent, color: T.onAccent, border: 'none', borderRadius: R.control,
            padding: '9px 0', fontSize: 14, fontWeight: W.title, fontFamily: T.display, cursor: 'pointer',
          }}
        >
          Abrir
        </button>
        {[
          { icon: Share2, label: 'Compartilhar chave', onClick: onShare, color: T.mute },
          { icon: Pencil, label: 'Editar prédio', onClick: onEdit, color: T.mute },
          { icon: Trash2, label: 'Excluir prédio', onClick: onDelete, color: T.danger },
        ].map(({ icon: Icon, label, onClick, color }) => (
          <button
            key={label}
            onClick={onClick}
            title={label}
            aria-label={label}
            className="transition-transform duration-150 hover:scale-110 active:scale-95"
            style={{
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.chip, border: 'none', borderRadius: R.control, color, cursor: 'pointer',
            }}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GestorHomePage() {
  const router = useRouter();
  const { show: toast } = useToastStore();
  const { data: buildings = [], isLoading } = useManagedBuildings();
  const deleteBuilding = useDeleteBuilding();

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [shareModal, setShareModal] = useState(null);

  const { mounted: editMounted } = useExitTransition(!!editModal);
  const editBuilding = useKeepWhileClosing(editModal, !!editModal);

  const isEmpty = !isLoading && buildings.length === 0;

  async function handleDelete() {
    try {
      await deleteBuilding.mutateAsync(deleteModal.id);
      setDeleteModal(null);
      toast('Prédio excluído', 'info');
    } catch (e) {
      toast(e?.response?.data?.error?.message || 'Erro ao excluir', 'error', e);
    }
  }

  // Área da conta de gestor. A conta nova, ainda sem prédio, entra aqui — é
  // esta tela que a deixa cadastrar o primeiro.
  return (
    <RouteGuard roles={['GESTOR', 'ADMIN']}>
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column' }}>
        <GestorHeader />

        <main id={CONTENT_ID} style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '48px 24px 72px', gap: 28,
        }}>
          {isLoading && (
            <div style={{ width: CARD_WIDTH, height: 172, background: T.card, borderRadius: R.card }} className="anim-fade-in animate-pulse" />
          )}

          {isEmpty && (
            <>
              <div className="anim-fade-up" style={{ textAlign: 'center' }}>
                <h1 style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 22, color: T.text }}>
                  Nenhum prédio ainda
                </h1>
                <p style={{ color: T.mute, fontSize: 14, marginTop: 6 }}>
                  Tudo começa pelo primeiro prédio.
                </p>
              </div>
              {/* Único elemento da tela vazia: o pop dá o empurrão que o texto não dá */}
              <CreateTile standalone className="anim-pop-in anim-d2" onClick={() => setCreateModal(true)} />
            </>
          )}

          {!isLoading && buildings.length > 0 && (
            <>
              <h1 className="anim-fade-down" style={{ fontFamily: T.display, fontWeight: W.title, fontSize: 22, color: T.text }}>
                Seus prédios
              </h1>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 16,
                justifyContent: 'center', alignItems: 'stretch', maxWidth: CARD_WIDTH * 3 + 32,
              }}>
                {buildings.map((b, idx) => (
                  <BuildingCard
                    key={b.id}
                    building={b}
                    // Entrada em cascata: os cartões sobem na ordem em que se leem
                    className={`anim-fade-up anim-d${Math.min(idx + 1, 6)}`}
                    onOpen={() => router.push(`/gestor/predios/${b.id}`)}
                    onShare={() => setShareModal(b)}
                    onEdit={() => setEditModal(b)}
                    onDelete={() => setDeleteModal(b)}
                  />
                ))}
                {/* O "+" fecha a fila, sempre depois do último cartão */}
                <CreateTile
                  className={`anim-fade-up anim-d${Math.min(buildings.length + 1, 6)}`}
                  onClick={() => setCreateModal(true)}
                />
              </div>
            </>
          )}
        </main>
      </div>

      <CreateBuildingModal open={createModal} onClose={() => setCreateModal(false)} />
      {/* Segurado montado durante a saída — sem isso a caixa de edição sumiria
          num quadro, já que quem a monta é este `editModal`. */}
      {editMounted && editBuilding && (
        <EditBuildingModal
          key={editBuilding.id}
          building={editBuilding}
          open={!!editModal}
          onClose={() => setEditModal(null)}
        />
      )}

      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Excluir prédio">
        <p style={{ color: T.mute, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
          Tem certeza que deseja excluir <span style={{ color: T.text, fontWeight: W.title }}>{deleteModal?.name}</span>?
          Andares, vínculos e vistorias vão junto. Esta ação não pode ser desfeita.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={() => setDeleteModal(null)}>Cancelar</Button>
          <Button variant="danger" style={{ flex: 1 }} onClick={handleDelete} loading={deleteBuilding.isPending}>Excluir</Button>
        </div>
      </Modal>

      <Modal open={!!shareModal} onClose={() => setShareModal(null)} title="Chave do prédio">
        <p style={{ color: T.mute, fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
          Compartilhe esta chave para que outras pessoas solicitem acesso a{' '}
          <span style={{ color: T.text, fontWeight: W.title }}>{shareModal?.name}</span>.
        </p>
        <div style={{ background: T.chip, borderRadius: R.control, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: T.accentInk, fontWeight: W.title, fontSize: 14, letterSpacing: '0.18em', wordBreak: 'break-all' }}>
            {formatShareKey(shareModal?.share_key)}
          </span>
          <button
            onClick={() => { navigator.clipboard.writeText(formatShareKey(shareModal?.share_key)); toast('Chave copiada!', 'info'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.mute, fontSize: 12, whiteSpace: 'nowrap', padding: '6px 12px' }}
          >
            Copiar
          </button>
        </div>
      </Modal>
    </RouteGuard>
  );
}
