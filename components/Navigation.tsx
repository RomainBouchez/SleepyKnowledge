'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/',         label: 'Nuit',     icon: '🌙' },
  { href: '/chat',     label: 'Coach IA', icon: '💬' },
  { href: '/patterns', label: 'Patterns', icon: '📊' },
  { href: '/report',   label: 'Rapport',  icon: '📋' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-sl-surface border-t border-sl-border safe-bottom"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
      <div className="flex">
        {TABS.map(tab => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center pt-2 pb-1 gap-0.5"
              style={{ minHeight: 56 }}>
              <span
                className="text-2xl leading-none transition-opacity"
                style={{ opacity: active ? 1 : 0.4 }}>
                {tab.icon}
              </span>
              <span
                className="text-[10px] font-medium tracking-wide transition-colors"
                style={{ color: active ? '#3B82F6' : '#475569' }}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
