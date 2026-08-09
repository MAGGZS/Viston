// Tela interna: exige sessão, então nunca deve aparecer em buscador.
export const metadata = {
  title: 'Perfil',
  robots: { index: false, follow: false, nocache: true },
};

export default function PerfilLayout({ children }) {
  return children;
}
