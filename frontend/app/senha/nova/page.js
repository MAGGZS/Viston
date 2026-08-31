'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '@/app/components/AuthShell';
import { CodigoInput } from '@/app/components/CodigoInput';
import { SenhaChecklist, senhaValida } from '@/app/components/SenhaChecklist';
import { useResetPassword, useVerifyResetCode } from '@/app/hooks/useApi';
import { limparEmailPendente, useEmailPendente } from '@/app/lib/emailPendente';
import { T, R } from '@/app/lib/theme';

const S = {
  campo: { display: 'flex', flexDirection: 'column', gap: 6 },
  rotulo: { fontSize: 12, fontWeight: 400, color: T.mute },
  input: {
    background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    borderRadius: R.control, padding: '13px 16px', color: T.text, fontSize: 16,
    outline: 'none', width: '100%',
  },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: {
    position: 'absolute', right: 6, background: 'none', border: 'none', padding: 8,
    cursor: 'pointer', color: T.mute, display: 'flex', alignItems: 'center',
  },
  btn: {
    width: '100%', background: T.accent, color: T.onAccent, fontWeight: 500, fontSize: 15,
    padding: '14px', borderRadius: R.control, border: 'none', cursor: 'pointer', marginTop: 4,
  },
  erro: { background: 'rgba(248,113,113,0.13)', borderRadius: R.control, padding: '11px 14px', textAlign: 'center' },
  aviso: { background: 'rgba(224,180,0,0.11)', borderRadius: R.control, padding: '13px 14px' },
  texto: { color: T.mute, fontSize: 14, lineHeight: 1.6 },
};

/**
 * Redefinir a senha, em dois passos na mesma tela.
 *
 * O primeiro passo só confere o código, sem gastá-lo — é o que impede a pessoa
 * de escolher uma senha, mandar, e só então descobrir que errou um dígito. O
 * segundo manda código e senha juntos: a validação do primeiro passo não
 * autoriza nada sozinha, senão bastaria pular aquela tela e postar direto.
 *
 * O endereço vem do `sessionStorage`, e não mais da query string: e-mail em URL
 * fica no histórico do navegador e sai no cabeçalho `Referer`. Some o
 * `useSearchParams`, e com ele o `<Suspense>` que ele obrigava.
 */
export default function NovaSenhaPage() {
  const router = useRouter();

  const email = useEmailPendente();

  const [passo, setPasso] = useState('codigo');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroLocal, setErroLocal] = useState(null);

  const verificar = useVerifyResetCode();
  const redefinir = useResetPassword();

  async function conferirCodigo(e) {
    e.preventDefault();
    if (codigo.length !== 6) return;
    try {
      await verificar.mutateAsync({ email, code: codigo });
      setPasso('senha');
    } catch {
      // A mensagem vem do backend.
    }
  }

  async function trocarSenha(e) {
    e.preventDefault();
    setErroLocal(null);

    if (!senhaValida(senha)) {
      setErroLocal('A senha não cumpre os requisitos abaixo');
      return;
    }
    if (senha !== confirmacao) {
      setErroLocal('As senhas não coincidem');
      return;
    }

    try {
      await redefinir.mutateAsync({ email, code: codigo, new_password: senha });
      limparEmailPendente();
      setPasso('pronto');
    } catch {
      // Código que venceu entre um passo e outro cai aqui — o backend recusa e
      // a mensagem explica. Voltar ao passo do código seria esconder o motivo.
    }
  }

  const casca = (miolo) => (
    <AuthShell
      title="Nova senha"
      footer={
        <p style={{ color: T.faint, fontSize: 14 }}>
          <a href="/login" style={{ color: T.accentInk, fontWeight: 500, textDecoration: 'none' }}>
            Voltar para o login
          </a>
        </p>
      }
    >
      {miolo}
    </AuthShell>
  );

  // Sem e-mail não há o que redefinir: quem abriu numa aba nova volta ao começo.
  if (!email) {
    return casca(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={S.texto}>Informe seu e-mail para receber um código de redefinição.</p>
        <button type="button" onClick={() => router.replace('/senha')} style={S.btn}>
          Pedir código
        </button>
      </div>
    );
  }

  if (passo === 'pronto') {
    return casca(
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={S.texto}>Senha alterada.</p>
        <div style={S.aviso}>
          <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6 }}>
            Por segurança, todas as sessões abertas nesta conta foram encerradas —
            inclusive em outros aparelhos. Entre de novo com a senha nova.
          </p>
        </div>
        <button type="button" onClick={() => router.replace('/login')} style={S.btn}>
          Ir para o login
        </button>
      </div>
    );
  }

  if (passo === 'codigo') {
    const erro = verificar.error?.response?.data?.error?.message;
    return casca(
      <form onSubmit={conferirCodigo} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={S.texto}>
          Enviamos um código de 6 dígitos para o seu e-mail. Ele vale por 10 minutos.
        </p>

        <CodigoInput valor={codigo} aoMudar={setCodigo} erro={erro} />

        <button
          type="submit"
          disabled={codigo.length !== 6 || verificar.isPending}
          style={{ ...S.btn, opacity: codigo.length !== 6 || verificar.isPending ? 0.6 : 1 }}
        >
          {verificar.isPending ? 'Conferindo...' : 'Continuar'}
        </button>

        <p style={{ ...S.texto, fontSize: 13, textAlign: 'center' }}>
          Não recebeu?{' '}
          <a href="/senha" style={{ color: T.accentInk, fontWeight: 500, textDecoration: 'none' }}>
            Pedir outro código
          </a>
        </p>
      </form>
    );
  }

  const erroApi = redefinir.error?.response?.data?.error?.message;
  const campos = [
    { id: 'senha', rotulo: 'Nova senha', valor: senha, set: setSenha, placeholder: 'Mínimo 8 caracteres' },
    { id: 'confirmacao', rotulo: 'Confirmar senha', valor: confirmacao, set: setConfirmacao, placeholder: 'Repita a senha' },
  ];

  return casca(
    <form onSubmit={trocarSenha} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={S.texto}>Código conferido. Escolha sua nova senha.</p>

      {campos.map(({ id, rotulo, valor, set, placeholder }) => (
        <div key={id} style={S.campo}>
          <label htmlFor={id} style={S.rotulo}>{rotulo}</label>
          <div style={S.inputWrap}>
            <input
              id={id}
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={placeholder}
              value={valor}
              onChange={(e) => set(e.target.value)}
              style={{ ...S.input, paddingRight: 46 }}
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              style={S.eyeBtn}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {/* A lista fica sob a senha nova, e nao sob a confirmacao. */}
          {id === 'senha' && <SenhaChecklist senha={senha} />}
        </div>
      ))}

      {(erroLocal || erroApi) && (
        <div role="alert" style={S.erro}>
          <p style={{ color: T.danger, fontSize: 14 }}>{erroLocal || erroApi}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={redefinir.isPending || !senhaValida(senha) || senha !== confirmacao}
        style={{
          ...S.btn,
          opacity: redefinir.isPending || !senhaValida(senha) || senha !== confirmacao ? 0.6 : 1,
        }}
      >
        {redefinir.isPending ? 'Salvando...' : 'Salvar nova senha'}
      </button>
    </form>
  );
}
