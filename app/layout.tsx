import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: '그린홈시스 회계관리',
  description: '법인통장 인트라넷',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        <div className="flex min-h-screen bg-gray-50">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}