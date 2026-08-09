// Tela interna: exige sessão, então nunca deve aparecer em buscador.
export const metadata = {
  title: 'Histórico',
  robots: { index: false, follow: false, nocache: true },
};

export default function HistoricoLayout({ children }) {
  return children;
}
