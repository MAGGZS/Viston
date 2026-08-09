// Tela interna: exige sessão, então nunca deve aparecer em buscador.
export const metadata = {
  title: 'Início',
  robots: { index: false, follow: false, nocache: true },
};

export default function HomeLayout({ children }) {
  return children;
}
