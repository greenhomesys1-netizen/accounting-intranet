'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const menus = [
  { href: '/dashboard', label: '대시보드', icon: '📊' },
  { href: '/cashbook', label: '자금현황 원장', icon: '📒' },
  { href: '/profit', label: '월별 손익 현황', icon: '💰' },
  { href: '/card', label: '카드매출 관리', icon: '💳' },
  { href: '/receipt', label: '현금영수증 관리', icon: '🧾' },
  { href: '/transfer', label: '대표님 이체 관리', icon: '🏦' },
  { href: '/tax', label: '홈택스 세금신고', icon: '📋' },
  { href: '/matching', label: '매입·매출 매칭', icon: '🔗' },
  { href: '/ppurio', label: '뿌리오 문자 관리', icon: '📱' },
]

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <div className="w-60 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">그린홈시스</h1>
        <p className="text-xs text-gray-400 mt-1">법인통장 회계관리</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {menus.map((menu) => (
          <Link
            key={menu.href}
            href={menu.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              pathname === menu.href
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{menu.icon}</span>
            <span>{menu.label}</span>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">그린홈시스 © 2026</p>
      </div>
    </div>
  )
}