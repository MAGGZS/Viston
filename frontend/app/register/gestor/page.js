'use client';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/app/components/AuthShell';
import { ConfirmarCodigo } from '@/app/components/ConfirmarCodigo';
import { SenhaChecklist, senhaValida } from '@/app/components/SenhaChecklist';
import { useUnsavedFlag } from '@/app/hooks/useUnsavedGuard';
import { useCreateManager } from '@/app/hooks/useApi';
import { T, R, W } from '@/app/lib/theme';

const schema = yup.object({
  name: yup.string().min(2, 'Mínimo 2 caracteres').required('Obrigatório'),
  email: yup.string().email('E-mail inválido').required('Obrigatório'),
  password: yup
    .string()
    .required('Obrigatório')
    // As quatro regras vêm do mesmo lugar que a lista de verificação desenha e
    // que o backend cobra — ver `components/SenhaChecklist`.
    .test('forte', 'A senha não cumpre os requisitos', (v) => senhaValida(v ?? '')),
  password_confirmation: yup
    .string()
    .oneOf([yup.ref('password')], 'As senhas não coincidem')
    .required('Obrigatório'),
});

const S = {
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 400, color: T.mute },
  input: { background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: R.control, padding: '13px 16px', color: T.text, fontSize: 16, outline: 'none', width: '100%' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 6, background: 'none', border: 'none', padding: 8, cursor: 'pointer', color: T.mute, display: 'flex', alignItems: 'center' },
  btn: { width: '100%', background: T.accent, color: T.onAccent, fontWeight: W.strong, fontSize: 15, padding: '14px', borderRadius: R.control, border: 'none', cursor: 'pointer', marginTop: 4 },
};

/**
 * Cadastro de gestor.
 *
 * A conta nasce na tabela de gestores, separada da de usuários: gestor é outro
 * tipo de conta, com login próprio. Ela já pode cadastrar prédio, e vira gestora
 * de cada prédio que cadastrar.
 */
export default function RegisterGestorPage() {
  const router = useRouter();
  const createManager = useCreateManager();
  // Campos vazios declarados: sem eles `isDirty` nunca volta a falso, e o
  // cadastro passa a perguntar "descartar alterações?" ao sair mesmo com tudo
  // apagado (ver desktop/admin/page.js).
  const { register, control, handleSubmit, formState: { errors, isDirty } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { name: '', email: '', password: '', password_confirmation: '', website: '' },
  });

  // As credenciais do cadastro, guardadas para o passo do código.
  //
  // O e-mail nunca aparece na tela: a tela de sucesso não pode dizer nem qual
  // endereço recebeu nem se a conta é nova — é a mesma regra da resposta única
  // do backend. A senha fica só para o botão de reenviar, que a exige.
  const [credenciais, setCredenciais] = useState(null);

  // `useWatch` e nao `watch()`: o segundo devolve uma funcao nova a cada render
  // e o compilador do React desiste de memoizar o componente inteiro — e o
  // projeto ja carrega um aviso desses no `FloorForm`.
  const senhaDigitada = useWatch({ control, name: 'password' }) ?? '';

  // Sair da tela com o cadastro pela metade — pelo link de entrar, por um
  // recarregar — passa a perguntar antes (ver components/UnsavedGuard.js).
  // Depois de enviado não há mais o que descartar — ver `/register`.
  useUnsavedFlag(isDirty && !credenciais);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Cadastrar não entra mais no sistema — mesma mudança de `/register`, e pela
   * mesma razão: a conta de gestor também nasce sem acesso, e o login
   * automático que existia aqui voltaria 403.
   *
   * A confirmação de senha não vai para a API: o cadastro recusa campo
   * desconhecido.
   */
  async function onSubmit({ password_confirmation, ...data }) {
    try {
      await createManager.mutateAsync(data);
      setCredenciais({ email: data.email, senha: data.password });
    } catch {}
  }

  const apiError = createManager.error?.response?.data?.error?.message;
  const isPending = createManager.isPending;

  const fields = [
    { name: 'name', label: 'Nome', type: 'text', placeholder: 'Seu nome completo' },
    { name: 'email', label: 'E-mail', type: 'email', placeholder: 'seu@email.com' },
    { name: 'password', label: 'Senha', type: 'password', placeholder: 'Mínimo 8 caracteres' },
    { name: 'password_confirmation', label: 'Confirmar senha', type: 'password', placeholder: 'Repita a senha' },
  ];

  // Mesma tela de sucesso de `/register`, e pelas mesmas razões: sem repetir o
  // e-mail, sem dizer se a conta é nova, sem redirecionamento automático.
  if (credenciais) {
    return (
      <AuthShell
        title="Confirme seu e-mail"
        footer={
          <p style={{ color: T.faint, fontSize: 14 }}>
            Já confirmou?{' '}
            <a href="/login" style={{ color: T.accentInk, fontWeight: W.title, textDecoration: 'none' }}>Entrar</a>
          </p>
        }
      >
        <ConfirmarCodigo
          email={credenciais.email}
          senha={credenciais.senha}
          aoConfirmar={() => router.replace('/login?confirmado=1')}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Criar conta de gestor"
      subtitle="Conta de gestor: você cadastra os prédios, aprova quem entra e define quem vistoria."
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: T.faint, fontSize: 14 }}>
            Já tem conta?{' '}
            <a href="/login" style={{ color: T.accentInk, fontWeight: W.title, textDecoration: 'none' }}>Entrar</a>
          </p>
          <p style={{ color: T.faint, fontSize: 14 }}>
            Vai vistoriar um prédio de outra pessoa?{' '}
            <a href="/register" style={{ color: T.accentInk, fontWeight: W.title, textDecoration: 'none' }}>Criar conta comum</a>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Armadilha para robô de formulário — ver `/register`. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }}
          {...register('website')}
        />
        {fields.map(({ name, label, type, placeholder }) => {
          const isPassword = type === 'password';
          const inputStyle = { ...S.input, ...(isPassword ? { paddingRight: 46 } : {}), ...(errors[name] ? { borderColor: 'rgba(248,113,113,0.5)' } : {}) };
          return (
            <div key={name} style={S.field}>
              <label style={S.label}>{label}</label>
              <div style={S.inputWrap}>
                <input
                  type={isPassword && showPassword ? 'text' : type}
                  placeholder={placeholder}
                  style={inputStyle}
                  {...register(name)}
                />
                {isPassword && (
                  <button type="button" onClick={() => setShowPassword(v => !v)} style={S.eyeBtn}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                )}
              </div>
              {errors[name] && <span style={{ fontSize: 12, color: T.danger }}>{errors[name].message}</span>}
              {name === 'password' && <SenhaChecklist senha={senhaDigitada} />}
            </div>
          );
        })}
        {apiError && (
          <div style={{ background: T.dangerSoft, borderRadius: R.control, padding: '11px 14px' }}>
            <p style={{ color: T.danger, fontSize: 14, textAlign: 'center' }}>{apiError}</p>
          </div>
        )}
        <button type="submit" disabled={isPending} style={{ ...S.btn, opacity: isPending ? 0.6 : 1 }}>
          {isPending ? 'Criando conta...' : 'Criar conta de gestor'}
        </button>
      </form>
    </AuthShell>
  );
}
