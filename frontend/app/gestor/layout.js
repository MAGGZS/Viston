// Área do gestor: tudo exige sessão, nada é indexável.
export const metadata = {
  title: 'Gestão',
  robots: { index: false, follow: false, nocache: true },
};

export default function GestorLayout({ children }) {
  return children;
}
