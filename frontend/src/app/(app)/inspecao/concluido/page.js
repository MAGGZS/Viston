'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle, ClipboardList, Home } from 'lucide-react';

export default function InspecaoConcluidoPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 bg-status-ok/20 rounded-full flex items-center justify-center mb-6">
        <CheckCircle className="w-10 h-10 text-status-ok" />
      </div>
      <h1 className="text-2xl font-extrabold mb-2">Inspeção Concluída!</h1>
      <p className="text-text-secondary mb-8 max-w-xs">
        O relatório foi gerado com sucesso. Você pode acessá-lo no histórico.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => router.push('/historico')} className="btn-primary w-full">
          <ClipboardList className="w-5 h-5" /> Ver Histórico
        </button>
        <button onClick={() => router.push('/home')} className="btn-secondary w-full">
          <Home className="w-5 h-5" /> Voltar ao Início
        </button>
      </div>
    </div>
  );
}
