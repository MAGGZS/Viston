'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, ClipboardList, Calendar, LogOut } from 'lucide-react';
import { useAuthStore } from '@/app/store/auth';

const items = [
  { href: '/desktop/admin', icon: Users, label: 'Usuários' },
  { href: '/desktop/admin/historico', icon: ClipboardList, label: 'Histórico' },
  { href: '/desktop/admin/calendario', icon: Calendar, label: 'Calendário' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { logout } = useAuthStore();
  const router = useRouter();

  return (
    <aside className="w-64 min-h-screen bg-[#1A1A1A] border-r border-[#2A2A2A] flex flex-col">
      <div className="p-6 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#F5C518] rounded-xl flex items-center justify-center">
            <span className="text-black font-black text-sm">V</span>
          </div>
          <span className="text-white font-bold text-lg">Viston</span>
        </div>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                active ? 'bg-[#F5C518]/10 text-[#F5C518]' : 'text-[#9A9A9A] hover:text-white hover:bg-[#2A2A2A]'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#2A2A2A]">
        <button
          onClick={() => { logout(); router.replace('/login'); }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-[#9A9A9A] hover:text-white hover:bg-[#2A2A2A] w-full transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Sair</span>
        </button>
      </div>
    </aside>
  );
}
