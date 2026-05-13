'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const 고정지출항목 = ['급여','임차료','관리비','통신비','보험료','광고선전비','이자비용','리스료','기타고정비']
const 변동지출항목 = ['외주용역비','복리후생비','접대비','여비교통비','여비출장비','사무용품비','소모품비','회의비','지급수수료','운반비','우편물수수료','세금과공과','광고선전비(변동)','기타변동비']
const 고정지출자동집계대상 = new Set(['급여','임차료','관리비','통신비','보험료','광고선전비','이자비용','리스료'])

type ExpenseItem = { id: string; name: string; amount: number }
type CashbookItem = { name: string; amount: number }

export default function ProfitPage() {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`)
  const [fixedName, setFixedName] = useState('')
  const [fixedAmount, setFixedAmount] = useState('')
  const [varName, setVarName] = useState('')
  const [varAmount, setVarAmount] = useState('')
  const [fixedList, setFixedList] = useState<ExpenseItem[]>([])
  const [varList, setVarList] = useState<ExpenseItem[]>([])
  const [cashbookFixed, setCashbookFixed] = useState<CashbookItem[]>([])
  const [cashbookVar, setCashbookVar] = useState<CashbookItem[]>([])
  const [excludedFixed, setExcludedFixed] = useState<Set<string>>(new Set())
  const [excludedVar, setExcludedVar] = useState<Set<string>>(new Set())
  const [editingFixed, setEditingFixed] = useState<string | null>(null)
  const [editingFixedAmount, setEditingFixedAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const activeCashbookFixed = cashbookFixed.filter(i => !excludedFixed.has(i.name))
  const activeCashbookVar = cashbookVar.filter(i => !excludedVar.has(i.name))
  const totalFixed = fixedList.reduce((s,i) => s+i.amount, 0) + activeCashbookFixed.reduce((s,i) => s+i.amount, 0)
  const totalVar = varList.reduce((s,i) => s+i.amount, 0) + activeCashbookVar.reduce((s,i) => s+i.amount, 0)
  const totalExpense = totalFixed + totalVar
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  useEffect(() => { loadData() }, [month])

  const loadData = async () => {
    setLoading(true)
    const [y, m] = month.split('-')
    const startDate = `${y}-${m}-01`
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
    const endDate = `${y}-${m}-${String(lastDay).padStart(2,'0')}`

    const { data: fixed } = await supabase.from('fixed_expenses').select('id, name, amount').eq('month', month)
    setFixedList(fixed || [])

    const { data: variable } = await supabase.from('variable_expenses').select('id, name, amount').eq('month', month)
    setVarList(variable || [])

    const { data: transactions } = await supabase
      .from('transactions').select('category, expense')
      .gte('date', startDate).lte('date', endDate).gt('expense', 0)

    if (transactions && transactions.length > 0) {
      const fixedGrouped: Record<string, number> = {}
      const varGrouped: Record<string, number> = {}

      transactions.forEach((tx: any) => {
        const key = tx.category || '기타'
        if (고정지출자동집계대상.has(key)) {
          fixedGrouped[key] = (fixedGrouped[key] || 0) + (tx.expense || 0)
        } else {
          varGrouped[key] = (varGrouped[key] || 0) + (tx.expense || 0)
        }
      })

      setCashbookFixed(Object.entries(fixedGrouped).map(([name, amount]) => ({ name, amount })).sort((a,b) => b.amount - a.amount))
      setCashbookVar(Object.entries(varGrouped).map(([name, amount]) => ({ name, amount })).sort((a,b) => b.amount - a.amount))
    } else {
      setCashbookFixed([])
      setCashbookVar([])
    }
    setLoading(false)
  }

  const addFixed = async () => {
    if (!fixedName || !fixedAmount) return
    const amt = parseInt(fixedAmount)
    const { data } = await supabase.from('fixed_expenses').insert({ name: fixedName, amount: amt, month }).select()
    if (data) setFixedList([...fixedList, data[0]])
    setFixedName(''); setFixedAmount('')
  }

  const deleteFixed = async (id: string) => {
    await supabase.from('fixed_expenses').delete().eq('id', id)
    setFixedList(fixedList.filter(i => i.id !== id))
  }

  const saveEditFixed = async (id: string) => {
    const amt = parseInt(editingFixedAmount)
    await supabase.from('fixed_expenses').update({ amount: amt }).eq('id', id)
    setFixedList(fixedList.map(i => i.id === id ? { ...i, amount: amt } : i))
    setEditingFixed(null)
  }

  const addVar = async () => {
    if (!varName || !varAmount) return
    const amt = parseInt(varAmount)
    const { data } = await supabase.from('variable_expenses').insert({ name: varName, amount: amt, month }).select()
    if (data) setVarList([...varList, data[0]])
    setVarName(''); setVarAmount('')
  }

  const deleteVar = async (id: string) => {
    await supabase.from('variable_expenses').delete().eq('id', id)
    setVarList(varList.filter(i => i.id !== id))
  }

  const toggleExclude = (set: Set<string>, setter: (s: Set<string>) => void, name: string) => {
    setter(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const AutoList = ({ items, excluded, onToggle }: { items: CashbookItem[], excluded: Set<string>, onToggle: (name: string) => void }) => (
    <div className="mt-4">
      <h3 className="text-xs font-bold text-gray-500 mb-1 border-t pt-3">🔄 자금현황 자동 집계</h3>
      <p className="text-xs text-gray-400 mb-2">체크 해제 시 합계에서 제외됩니다</p>
      <div className="space-y-1">
        {items.map((item) => {
          const ex = excluded.has(item.name)
          return (
            <div key={item.name} className={`flex justify-between items-center text-sm py-1.5 border-b px-2 rounded ${ex ? 'opacity-40' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!ex} onChange={() => onToggle(item.name)} className="cursor-pointer" />
                <span className={ex ? 'line-through text-gray-400' : 'text-gray-600'}>{item.name}</span>
              </div>
              <span className={`font-medium text-sm ${ex ? 'text-gray-300' : 'text-gray-700'}`}>{fmt(item.amount)}</span>
            </div>
          )
        })}
        <div className="flex justify-between text-sm pt-1 font-bold text-gray-500">
          <span>자동집계 합계</span>
          <span>{fmt(items.filter(i => !excluded.has(i.name)).reduce((s,i) => s+i.amount, 0))}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">월별 손익 현황</h1>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
        {loading && <span className="text-sm text-gray-400">불러오는 중...</span>}
      </div>

      <div className="bg-green-50 rounded-xl p-6 mb-8 text-center">
        <p className="text-sm text-gray-500 mb-1">고정지출 + 변동지출 합계</p>
        <p className="text-4xl font-bold text-green-600">{fmt(totalExpense)}</p>
        <p className="text-sm text-gray-400 mt-2">고정 {fmt(totalFixed)} + 변동 {fmt(totalVar)}</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* 고정지출 */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-bold text-gray-800 mb-4">📌 고정지출 (매월 반복)</h2>
          <div className="flex gap-2 mb-4">
            <select value={fixedName} onChange={e => setFixedName(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm">
              <option value="">항목 선택</option>
              {고정지출항목.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input type="number" placeholder="금액" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} className="w-28 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={addFixed} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">추가</button>
          </div>
          <div className="space-y-2">
            {fixedList.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm py-2 border-b">
                <span className="text-gray-700">{item.name}</span>
                {editingFixed === item.id ? (
                  <div className="flex gap-1 items-center">
                    <input type="number" value={editingFixedAmount} onChange={e => setEditingFixedAmount(e.target.value)} className="w-28 border rounded px-2 py-1 text-sm" />
                    <button onClick={() => saveEditFixed(item.id)} className="text-blue-600 text-xs px-2">저장</button>
                    <button onClick={() => setEditingFixed(null)} className="text-gray-400 text-xs px-1">취소</button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <span className="font-medium">{fmt(item.amount)}</span>
                    <button onClick={() => { setEditingFixed(item.id); setEditingFixedAmount(String(item.amount)) }} className="text-blue-500 text-xs">수정</button>
                    <button onClick={() => deleteFixed(item.id)} className="text-red-400 text-xs">삭제</button>
                  </div>
                )}
              </div>
            ))}
            {fixedList.length > 0 && (
              <div className="flex justify-between text-sm pt-2 font-bold text-blue-600">
                <span>수동입력 합계</span><span>{fmt(fixedList.reduce((s,i) => s+i.amount, 0))}</span>
              </div>
            )}
          </div>
          {cashbookFixed.length > 0 && (
            <AutoList items={cashbookFixed} excluded={excludedFixed} onToggle={(name) => toggleExclude(excludedFixed, setExcludedFixed, name)} />
          )}
          <div className="flex justify-between text-sm pt-3 mt-2 border-t font-bold text-blue-700">
            <span>고정지출 합계</span><span>{fmt(totalFixed)}</span>
          </div>
        </div>

        {/* 변동지출 */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-bold text-gray-800 mb-4">📊 변동지출 (이번 달만)</h2>
          <div className="flex gap-2 mb-4">
            <select value={varName} onChange={e => setVarName(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm">
              <option value="">항목 선택</option>
              {변동지출항목.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
            <input type="number" placeholder="금액" value={varAmount} onChange={e => setVarAmount(e.target.value)} className="w-28 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={addVar} className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600">추가</button>
          </div>
          <div className="space-y-2">
            {varList.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm py-2 border-b">
                <span className="text-gray-700">{item.name}</span>
                <div className="flex gap-2 items-center">
                  <span className="font-medium">{fmt(item.amount)}</span>
                  <button onClick={() => deleteVar(item.id)} className="text-red-400 text-xs">삭제</button>
                </div>
              </div>
            ))}
            {varList.length > 0 && (
              <div className="flex justify-between text-sm pt-2 font-bold text-orange-500">
                <span>수동입력 합계</span><span>{fmt(varList.reduce((s,i) => s+i.amount, 0))}</span>
              </div>
            )}
          </div>
          {cashbookVar.length > 0 && (
            <AutoList items={cashbookVar} excluded={excludedVar} onToggle={(name) => toggleExclude(excludedVar, setExcludedVar, name)} />
          )}
          <div className="flex justify-between text-sm pt-3 mt-2 border-t font-bold text-orange-600">
            <span>변동지출 합계</span><span>{fmt(totalVar)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
