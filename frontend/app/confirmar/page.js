'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { AuthShell } from '@/app/components/AuthShell';
import { useConfirmEmail } from '@/app/hooks/useApi';
import { T, R } from '@/app/lib/theme';

const SEGUNDOS_ATE_O_LOGIN = 3;

const S = {
  box: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' },
  texto: { color: T.mute, fontSize: 14, lineHeight: 1.6 },
  btn: {
    width: '100%', background: T.accent, color: T.onAccent, fontWeight: 500, fontSize: 15,
    padding: '14px', borderRadius: R.control, border: 'none', cursor: 'pointer', marginTop: 8,
  },
};

/**
 * O que a tela faz assim que abre: troca o token pelo acesso.
 *
 * Sem formulário e sem botão de confirmar. Quem chegou aqui já clicou uma vez,
 * no e-mail; pedir um segundo clique só adiaria a mesma coisa.
 */
function Confirmacao() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const { mutate, isSuccess, isError, isPending } = useConfirmEmail();

  // O React roda o efeito duas vezes em desenvolvimento (StrictMode), e o
  // segundo disparo encontraria o link já consumido pelo primeiro — sucesso
  // viraria "link inválido" só na máquina de quem desenvolve. Uma trava por
  // montagem resolve, e não custa nada em produção.
  const jaPediu = useRef(false);

  useEffect(() => {
    if (!token || jaPediu.current) return;
    jaPediu.current = true;
    mutate(token);
  }, [token, mutate]);

  // Depois de liberar o acesso, o caminho é o login: confirmar não cria sessão,
  // porque quem clicou pode estar noutro aparelho, ou num link encaminhado.
  useEffect(() => {
    if (!isSuccess) return;
    const t = setTimeout(() => router.replace('/login'), SEGUNDOS_ATE_O_LOGIN * 1000);
    return () => clearTimeout(t);
  }, [isSuccess, router]);

  const falhou = isError || !token;

  if (isPending || (!falhou && !isSuccess)) {
    return (
      <div style={S.box} role="status">
        <p style={S.texto}>Confirmando seu e-mail...</p>
      </div>
    );
  }

  if (falhou) {
    return (
      <div style={S.box} role="alert">
        <XCircle size={40} color={T.danger} aria-hidden="true" />
        <p style={S.texto}>
          Link inválido ou expirado. Entre com sua conta para pedir outro.
        </p>
        <button type="button" onClick={() => router.replace('/login')} style={S.btn}>
          Ir para o login
        </button>
      </div>
    );
  }

  return (
    <div style={S.box} role="status">
      <CheckCircle2 size={40} color={T.accentInk} aria-hidden="true" />
      <p style={S.texto}>
        Acesso liberado. Levando você ao login...
      </p>
      <button type="button" onClick={() => router.replace('/login')} style={S.btn}>
        Entrar agora
      </button>
    </div>
  );
}

/**
 * `useSearchParams` obriga o Suspense: sem ele, a árvore inteira até o topo
 * deixa de ser prerenderizada. Com ele, a casca sai no HTML inicial e só o
 * miolo espera — ver `use-search-params` nos docs do Next 16.
 */
export default function ConfirmarPage() {
  return (
    <AuthShell title="Confirmação de e-mail">
      <Suspense fallback={<p style={S.texto}>Confirmando seu e-mail...</p>}>
        <Confirmacao />
      </Suspense>
    </AuthShell>
  );
}
