'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const 고정지출항목 = ['급여','임차료','관리비','통신비','보험료','광고선전비','이자비용','리스료','기타고정비']
const 변동지출항목 = ['외주용역비','복리후생비','접대비','여비교통비','여비출장비','사무용품비','소모품비','회의비','지급수수료','운반비','우편물수수료','세금과공과','광고선전비(변동)','기타변동비']

export default function ProfitPage() {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`)
  const [fixedName, setFixedName] = useState('')
  const [fixedAmount, setFixedAmount] = useState('')
  const [varName, setVarName] = useState('')
  const [varAmount, setVarAmount] = useState('')
  const [fixedList, setFixedList] = useState<{name:string,amount:number}[]>([])
  const [varList, setVarList] = useState<{name:string,amount:number}[]>([])
  const [cashbookVar, setCashbookVar] = useState<{name:string,amount:number}[]>([])
  const [loading, setLoading] = useState(false)

  const totalFixed = fixedList.reduce((s,i) => s+i.amount, 0)
  const totalVar = varList.reduce((s,i) => s+i.amount, 0)
  const totalCashbookVar = cashbookVar.reduce((s,i) => s+i.amount, 0)
  const totalExpense = totalFixed + totalVar + totalCashbookVar
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  useEffect(() => { loadData() }, [month])

  const loadData = async () => {
    setLoading(true)
    const [y, m] = month.split('-')
    const startDate = `${y}-${m}-01`
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const endDate = `${y}-${m}-${String(lastDay).padStart(2,'0')}`

    // 고정지출 불러오기
    const { data: fixed } = await supabase
      .from('fixed_expenses')
      .select('name, amount')
      .eq('month', month)
    setFixedList(fixed || [])

    // 변동지출 불러오기
    const { data: variable } = await supabase
      .from('variable_expenses')
      .select('name, amount')
      .eq('month', month)
    setVarList(variable || [])

    // 자금현황 출금 내역 계정별 집계 (expense > 0)
    const { data: transactions } = await supabase
      .from('transactions')
      .select('category, expense')
      .gte('date', startDate)
      .lte('date', endDate)
      .gt('expense', 0)

    if (transactions && transactions.length > 0) {
      const grouped: Record<string, number> = {}
      transactions.forEach((tx: any) => {
        const key = tx.category || '기타'
        grouped[key] = (grouped[key] || 0) + (tx.expense || 0)
      })
      const result = Object.entries(grouped)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
      setCashbookVar(result)
    } else {
      setCashbookVar([])
    }

    setLoading(false)
  }

  const addFixed = async () => {
    if (!fixedName || !fixedAmount) return
    const amt = parseInt(fixedAmount)
    await supabase.from('fixed_expenses').insert({ name: fixedName, amount: amt, month })
    setFixedList([...fixedList, { name: fixedName, amount: amt }])
    setFixedName(''); setFixedAmount('')
  }

  const addVar = async () => {
    if (!varName || !varAmount) return
    const amt = parseInt(varAmount)
    await supabase.from('variable_expenses').insert({ name: varName, amount: amt, month })
    setVarList([...varList, { name: varName, amount: amt }])
    setVarName(''); setVarAmount('')
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">월별 손익 현황</h1>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm" />
        {loading && <span className="text-sm text-gray-400">불러오는 중...</span>}
      </div>

      <div className="bg-green-50 rounded-xl p-6 mb-8 text-center">
        <p className="text-sm text-gray-500 mb-1">고정지출 + 변동지출 합계</p>
        <p className="text-4xl font-bold text-green-600">{fmt(totalExpense)}</p>
        <p className="text-sm text-gray-400 mt-2">고정 {fmt(totalFixed)} + 변동 {fmt(totalVar + totalCashbookVar)}</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* 고정지출 */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-bold text-gray-800 mb-4">📌 고정지출 (매월 반복)</h2>
          <div className="flex gap-2 mb-4">
            <select value={fixedName} onChange={e => setFixedName(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm">
              <option value="">항목 선택</option>
              {고정지출항목.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input type="number" placeholder="금액" value={fixedAmount}
              onChange={e => setFixedAmount(e.target.value)}
              className="w-28 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={addFixed}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">추가</button>
          </div>
          <div className="space-y-2">
            {fixedList.map((item, i) => (
              <div key={i} className="flex justify-between text-sm py-2 border-b">
                <span className="text-gray-700">{item.name}</span>
                <span className="font-medium">{fmt(item.amount)}</span>
              </div>
            ))}
            {fixedList.length > 0 && (
              <div className="flex justify-between text-sm pt-2 font-bold text-blue-600">
                <span>합계</span><span>{fmt(totalFixed)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 변동지출 */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-bold text-gray-800 mb-4">📊 변동지출 (이번 달만)</h2>
          <div className="flex gap-2 mb-4">
            <select value={varName} onChange={e => setVarName(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm">
              <option value="">항목 선택</option>
              {변동지출항목.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input type="number" placeholder="금액" value={varAmount}
              onChange={e => setVarAmount(e.target.value)}
              className="w-28 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={addVar}
              className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600">추가</button>
          </div>
          <div className="space-y-2">
            {varList.map((item, i) => (
              <div key={i} className="flex justify-between text-sm py-2 border-b">
                <span className="text-gray-700">{item.name}</span>
                <span className="font-medium">{fmt(item.amount)}</span>
              </div>
            ))}
            {varList.length > 0 && (
              <div className="flex justify-between text-sm pt-2 font-bold text-orange-500">
                <span>합계</span><span>{fmt(totalVar)}</span>
              </div>
            )}
          </div>

          {/* 자금현황 자동 집계 */}
          {cashbookVar.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-500 mb-2 border-t pt-4">🔄 자금현황 출금 자동 집계</h3>
              <div className="space-y-2">
                {cashbookVar.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm py-2 border-b bg-gray-50 px-2 rounded">
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium text-gray-700">{fmt(item.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 font-bold text-gray-600">
                  <span>자동집계 합계</span><span>{fmt(totalCashbookVar)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
