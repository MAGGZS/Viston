// Tela interna: exige sessão, então nunca deve aparecer em buscador.
export const metadata = {
  title: 'Nova vistoria',
  robots: { index: false, follow: false, nocache: true },
};

export default function InspecaoLayout({ children }) {
  return children;
}
