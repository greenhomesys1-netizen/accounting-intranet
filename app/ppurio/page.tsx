'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

type PpurioHistory = {
  id: string
  date: string
  title: string
  type: string
  used_seeds: number
  balance_seeds: number
  is_charge: boolean
  charge_seeds: number
}

const SEED_PRICE = 10 // 씨앗 1통 = 10원

export default function PpurioPage() {
  const [history, setHistory] = useState<PpurioHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const currentBalance = history.length > 0
    ? history.find(h => !h.is_charge)?.balance_seeds ?? 0
    : 0

  // 최신 잔액 (is_charge 아닌 것 중 가장 최근)
  const latestBalance = [...history]
    .filter(h => h.balance_seeds > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.balance_seeds ?? 0

  const totalUsed = history.filter(h => !h.is_charge).reduce((s, h) => s + h.used_seeds, 0)
  const totalCharged = history.filter(h => h.is_charge).reduce((s, h) => s + h.charge_seeds, 0)

  const fmt = (n: number) => n.toLocaleString('ko-KR')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ppurio_history')
      .select('*')
      .order('date', { ascending: false })
    if (data) setHistory(data)
    setLoading(false)
  }

  // 월별 집계
  const monthlyStats = history
    .filter(h => !h.is_charge)
    .reduce((acc: Record<string, { seeds: number; cost: number; count: number }>, h) => {
      const month = h.date.substring(0, 7)
      if (!acc[month]) acc[month] = { seeds: 0, cost: 0, count: 0 }
      acc[month].seeds += h.used_seeds
      acc[month].cost += h.used_seeds * SEED_PRICE
      acc[month].count += 1
      return acc
    }, {})

  const monthlyList = Object.entries(monthlyStats)
    .sort((a, b) => b[0].localeCompare(a[0]))

  // 필터된 발송 이력
  const filteredHistory = history.filter(h => {
    if (!filterMonth) return true
    return h.date.startsWith(filterMonth)
  })

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult('')

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result
        const wb = XLSX.read(data, { type: 'array' })
        // SheetJS 시트 사용
        const sheetName = wb.SheetNames.find(s => s === 'SheetJS') || wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][]

        const items: Omit<PpurioHistory, 'id'>[] = []

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[0]) continue

          // 날짜 파싱 (YY-MM-DD 형식)
          const rawDate = String(row[0]).trim()
          let dateStr = ''
          if (rawDate.match(/^\d{2}-\d{2}-\d{2}$/)) {
            dateStr = `20${rawDate}`
          } else if (rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            dateStr = rawDate
          } else continue

          const title = String(row[1] || '').trim()
          const type = String(row[2] || '').trim()
          const chargeSeeds = Number(row[5]) || 0  // 충전(씨앗)
          const usedSeeds = Math.abs(Number(row[8]) || 0)  // 사용(씨앗) - 음수값
          const balanceSeeds = Number(row[11]) || 0  // 잔액(씨앗)

          const isCharge = chargeSeeds > 0

          if (!isCharge && usedSeeds === 0) continue

          items.push({
            date: dateStr,
            title,
            type,
            used_seeds: usedSeeds,
            balance_seeds: balanceSeeds,
            is_charge: isCharge,
            charge_seeds: chargeSeeds,
          })
        }

        // 중복 방지: 날짜+제목+사용씨앗 기준
        let inserted = 0
        for (const item of items) {
          const { data: existing } = await supabase
            .from('ppurio_history')
            .select('id')
            .eq('date', item.date)
            .eq('used_seeds', item.used_seeds)
            .eq('title', item.title)
            .limit(1)

          if (!existing || existing.length === 0) {
            const { error } = await supabase.from('ppurio_history').insert(item)
            if (!error) inserted++
          }
        }

        setUploadResult(`✅ ${inserted}건 업로드 완료! (전체 ${items.length}건 중 중복 제외)`)
        await fetchData()
      } catch (err) {
        setUploadResult('❌ 업로드 실패: ' + String(err))
      }
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">뿌리오 문자 관리</h1>
          <p className="text-sm text-gray-400 mt-1">씨앗 잔액 · 발송 이력 · 월별 비용 집계</p>
        </div>
        <label className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer">
          {uploading ? '업로드 중...' : '📂 내역 업로드'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} disabled={uploading} />
        </label>
      </div>

      {uploadResult && (
        <div className={`px-4 py-3 rounded-lg mb-4 text-sm ${uploadResult.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {uploadResult}
        </div>
      )}

      {/* 잔액 대시보드 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">현재 씨앗 잔액</p>
          <p className="text-2xl font-bold text-yellow-600">{fmt(latestBalance)}통</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">금액 환산</p>
          <p className="text-2xl font-bold text-green-600">{fmt(latestBalance * SEED_PRICE)}원</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">포토문자 발송 가능</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(Math.floor(latestBalance / 6))}건</p>
          <p className="text-xs text-gray-400 mt-1">6통/건</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">단문 발송 가능</p>
          <p className="text-2xl font-bold text-purple-600">{fmt(latestBalance)}건</p>
          <p className="text-xs text-gray-400 mt-1">1통/건</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* 월별 비용 집계 */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-bold text-gray-800 mb-4">📊 월별 비용 집계</h2>
          <div className="space-y-2">
            {monthlyList.length === 0 ? (
              <p className="text-gray-400 text-sm">데이터가 없습니다.</p>
            ) : (
              monthlyList.map(([month, stat]) => (
                <div key={month} className="flex justify-between items-center py-2 border-b text-sm">
                  <div>
                    <span className="font-medium text-gray-800">{month}</span>
                    <span className="text-gray-400 ml-2 text-xs">{stat.count}회</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-600">{fmt(stat.seeds)}통</span>
                    <span className={`ml-3 font-bold ${stat.cost >= 300000 ? 'text-red-500' : 'text-gray-800'}`}>
                      {fmt(stat.cost)}원
                    </span>
                    {stat.cost >= 300000 && <span className="ml-1 text-xs">🔴</span>}
                  </div>
                </div>
              ))
            )}
            {monthlyList.length > 0 && (
              <div className="flex justify-between items-center pt-2 text-sm font-bold text-gray-700">
                <span>총계</span>
                <span>{fmt(totalUsed * SEED_PRICE)}원</span>
              </div>
            )}
          </div>
        </div>

        {/* 충전 내역 */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-bold text-gray-800 mb-4">💳 충전 내역</h2>
          <div className="space-y-2">
            {history.filter(h => h.is_charge).length === 0 ? (
              <p className="text-gray-400 text-sm">충전 내역이 없습니다.</p>
            ) : (
              history.filter(h => h.is_charge).map(h => (
                <div key={h.id} className="flex justify-between items-center py-2 border-b text-sm">
                  <div>
                    <p className="text-gray-800 font-medium">{h.date}</p>
                    <p className="text-gray-400 text-xs">{h.title || h.type}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600">+{fmt(h.charge_seeds)}통</p>
                    <p className="text-xs text-gray-400">{fmt(h.charge_seeds * SEED_PRICE)}원</p>
                  </div>
                </div>
              ))
            )}
            <div className="flex justify-between items-center pt-2 text-sm font-bold text-green-600">
              <span>총 충전</span>
              <span>{fmt(totalCharged)}통 ({fmt(totalCharged * SEED_PRICE)}원)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 발송 이력 */}
      <div className="bg-white rounded-xl border mt-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-800">📱 발송 이력</h2>
          <input
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
            placeholder="월 선택"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">날짜</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">제목</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">유형</th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">사용 씨앗</th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">비용(원)</th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">잔액(통)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">불러오는 중...</td></tr>
            ) : filteredHistory.filter(h => !h.is_charge).length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">발송 내역이 없습니다.</td></tr>
            ) : (
              filteredHistory.filter(h => !h.is_charge).map(h => (
                <tr key={h.id} className={`border-b hover:bg-gray-50 ${h.used_seeds <= 12 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-4 py-3 text-gray-600">{h.date}</td>
                  <td className="px-4 py-3 text-gray-800">
                    {h.title}
                    {h.used_seeds <= 12 && <span className="ml-1 text-xs text-gray-400">(테스트)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{h.type}</td>
                  <td className="px-4 py-3 text-right font-medium text-orange-500">{fmt(h.used_seeds)}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-500">{fmt(h.used_seeds * SEED_PRICE)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmt(h.balance_seeds)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
