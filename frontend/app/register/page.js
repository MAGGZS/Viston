'use client';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/app/components/AuthShell';
import { ConfirmarCodigo } from '@/app/components/ConfirmarCodigo';
import { SenhaChecklist, senhaValida, useFocoSenha } from '@/app/components/SenhaChecklist';
import { useUnsavedFlag } from '@/app/hooks/useUnsavedGuard';
import { useCreateUser } from '@/app/hooks/useApi';
import { T, R } from '@/app/lib/theme';

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
  // `position: relative` faz deste bloco a âncora da lista de exigências
  // da senha, que flutua ao lado sem ocupar espaço — ver `.senha-regras`.
  field: { display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' },
  label: { fontSize: 12, fontWeight: 400, color: T.mute },
  input: { background: T.chip, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: R.control, padding: '13px 16px', color: T.text, fontSize: 16, outline: 'none', width: '100%' },
  inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 6, background: 'none', border: 'none', padding: 8, cursor: 'pointer', color: T.mute, display: 'flex', alignItems: 'center' },
  btn: { width: '100%', background: T.accent, color: T.onAccent, fontWeight: 500, fontSize: 15, padding: '14px', borderRadius: R.control, border: 'none', cursor: 'pointer', marginTop: 4 },
};

export default function RegisterPage() {
  const router = useRouter();
  const createUser = useCreateUser();
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
  const foco = useFocoSenha();

  // Sair da tela com o cadastro pela metade — pelo link de entrar, por um
  // recarregar — passa a perguntar antes (ver components/UnsavedGuard.js).
  // Depois de enviado não há mais o que descartar: os campos ainda estão
  // preenchidos por baixo, e sem o `!enviado` a tela de sucesso perguntaria
  // "descartar alterações?" a quem só quer ir ler o e-mail.
  useUnsavedFlag(isDirty && !credenciais);
  const [showPassword, setShowPassword] = useState(false);

  /**
   * Cadastrar não entra mais no sistema.
   *
   * Aqui havia um login automático logo depois de criar a conta. Com a
   * confirmação de e-mail ele passou a ser impossível por construção: a conta
   * nasce sem acesso, e esse login voltaria 403 na cara de quem acabou de se
   * cadastrar. O caminho agora termina nesta tela e recomeça no e-mail.
   *
   * A confirmação de senha fica no formulário: o cadastro público recusa campo
   * que não conheça (`.strict()` no back), então ela não pode ir junto.
   */
  async function onSubmit({ password_confirmation, ...data }) {
    try {
      await createUser.mutateAsync(data);
      setCredenciais({ email: data.email, senha: data.password });
    } catch {}
  }

  const apiError = createUser.error?.response?.data?.error?.message;
  const isPending = createUser.isPending;

  const fields = [
    { name: 'name', label: 'Nome', type: 'text', placeholder: 'Seu nome completo' },
    { name: 'email', label: 'E-mail', type: 'email', placeholder: 'seu@email.com' },
    { name: 'password', label: 'Senha', type: 'password', placeholder: 'Mínimo 8 caracteres' },
    { name: 'password_confirmation', label: 'Confirmar senha', type: 'password', placeholder: 'Repita a senha' },
  ];

  /**
   * A tela de sucesso não repete o e-mail digitado e não diz se a conta é nova.
   *
   * É a mesma coisa que o backend faz na resposta: se aqui aparecesse "enviamos
   * para fulano@x.com" ou "esta conta já existia", o cuidado do outro lado teria
   * sido em vão. Sem redirecionamento automático também — o próximo passo não é
   * nesta aba, é na caixa de entrada.
   */
  if (credenciais) {
    return (
      <AuthShell
        title="Confirme seu e-mail"
        footer={
          <p style={{ color: T.faint, fontSize: 14 }}>
            Já confirmou?{' '}
            <a href="/login" style={{ color: T.accentInk, fontWeight: 600, textDecoration: 'none' }}>Entrar</a>
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
      title="Criar conta"
      subtitle="Depois de entrar, peça a chave do prédio ao administrador para começar a vistoriar."
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: T.faint, fontSize: 14 }}>
            Já tem conta?{' '}
            <a href="/login" style={{ color: T.accentInk, fontWeight: 600, textDecoration: 'none' }}>Entrar</a>
          </p>
          <p style={{ color: T.faint, fontSize: 14 }}>
            Vai administrar um prédio?{' '}
            <a href="/register/gestor" style={{ color: T.accentInk, fontWeight: 600, textDecoration: 'none' }}>Cadastre-se como gestor</a>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/*
              Armadilha para robô de formulário. Humano nenhum vê este campo, e
              nenhum leitor de tela o anuncia; robô que preenche tudo que
              encontra cai nele, e o backend responde o sucesso de sempre sem
              criar nada.

              `position:absolute` e não `display:none`: o segundo é o truque
              conhecido, e robô que se dá ao trabalho de olhar o CSS pula campo
              escondido assim. Este continua no fluxo, só que a 9999px daqui.
            */}
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
                <div key={name} style={S.field} {...(name === 'password' ? foco.ancora : {})}>
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
                  {/* A lista fica sob a senha, e nao sob a confirmacao: e naquele
                      campo que as regras valem. */}
                  {name === 'password' && <SenhaChecklist senha={senhaDigitada} aberta={foco.aberta} />}
                </div>
              );
            })}
            {apiError && (
              <div style={{ background: 'rgba(248,113,113,0.13)', borderRadius: R.control, padding: '11px 14px' }}>
                <p style={{ color: T.danger, fontSize: 14, textAlign: 'center' }}>{apiError}</p>
              </div>
            )}
        <button type="submit" disabled={isPending} style={{ ...S.btn, opacity: isPending ? 0.6 : 1 }}>
          {isPending ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
    </AuthShell>
  );
}
