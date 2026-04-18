'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Bot, TrendingUp, FileText, Upload } from 'lucide-react';

const TABS = [
  { href: '/',         label: 'Nuit',    Icon: Moon       },
  { href: '/chat',     label: 'Coach',   Icon: Bot        },
  { href: '/patterns', label: 'Trends',  Icon: TrendingUp },
  { href: '/report',   label: 'Rapport', Icon: FileText   },
  { href: '/import',   label: 'Import',  Icon: Upload     },
];

const N = TABS.length;

export default function Navigation() {
  const pathname   = usePathname();
  const activeIdx  = TABS.findIndex(t =>
    t.href === '/' ? pathname === '/' : pathname.startsWith(t.href)
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center items-end pointer-events-none"
      style={{ bottom: '0px' }}>

      {/* Floating pill dock */}
      <div
        className="pointer-events-auto relative flex items-center p-1.5"
        style={{
          width: 'calc(100% - 40px)',
          maxWidth: 420,
          borderRadius: 9999,
          background: 'rgba(16, 13, 12, 0.72)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          boxShadow: [
            '0 -8px 32px rgba(0, 0, 0, 0.55)',
            '0 -2px 8px rgba(0, 0, 0, 0.4)',
            'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          ].join(', '),
        }}>

        {/* Sliding orange pill */}
        <div
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            top: 6,
            bottom: 6,
            left: 6,
            width: `calc((100% - 12px) / ${N})`,
            transform: `translateX(calc(${activeIdx} * 100%))`,
            transition: 'transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)',
            background: 'rgba(255, 107, 53, 0.2)',
            border: '1px solid rgba(255, 107, 53, 0.38)',
            boxShadow: [
              '0 0 20px rgba(255, 107, 53, 0.25)',
              'inset 0 1px 0 rgba(255, 180, 120, 0.15)',
            ].join(', '),
          }}
        />

        {/* Tabs */}
        {TABS.map((tab, i) => {
          const active = i === activeIdx;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative z-10 flex-1 flex flex-col items-center justify-center gap-1 py-1.5 rounded-full active:scale-90 transition-transform duration-150">

              <tab.Icon
                size={18}
                strokeWidth={active ? 2.5 : 1.8}
                style={{
                  color: active ? '#ff6b35' : 'rgba(255,255,255,0.28)',
                  filter: active ? 'drop-shadow(0 0 6px rgba(255,107,53,0.8))' : 'none',
                  transform: active ? 'scale(1.12)' : 'scale(1)',
                  transition: 'color 0.25s, transform 0.25s, filter 0.25s',
                }}
              />

              <span
                className="text-[8px] font-black tracking-widest uppercase leading-none"
                style={{
                  color: active ? '#ff6b35' : 'rgba(255,255,255,0.2)',
                  transition: 'color 0.25s',
                }}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
