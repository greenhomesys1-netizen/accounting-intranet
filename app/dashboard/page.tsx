'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
  const [income, setIncome] = useState(0)
  const [expense, setExpense] = useState(0)
  const [balance, setBalance] = useState(0)
  const [fixedTotal, setFixedTotal] = useState(0)
  const [varTotal, setVarTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', `${thisMonth}-01`)
        .lte('date', `${thisMonth}-31`)
      if (txData) {
        setIncome(txData.reduce((s,i) => s+i.income, 0))
        setExpense(txData.reduce((s,i) => s+i.expense, 0))
      }
      const { data: lastTx } = await supabase
        .from('transactions')
        .select('balance')
        .order('date', { ascending: false })
        .limit(1)
      if (lastTx && lastTx.length > 0) setBalance(lastTx[0].balance)

      const { data: fixedData } = await supabase
        .from('fixed_expenses')
        .select('amount')
        .eq('month', thisMonth)
      if (fixedData) setFixedTotal(fixedData.reduce((s,i) => s+i.amount, 0))

      const { data: varData } = await supabase
        .from('variable_expenses')
        .select('amount')
        .eq('month', thisMonth)
      if (varData) setVarTotal(varData.reduce((s,i) => s+i.amount, 0))

      setLoading(false)
    }
    fetchAll()
  }, [])

  const profit = income - fixedTotal - varTotal
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  const cards = [
    { label: '이번 달 총 입금', value: fmt(income), color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
    { label: '이번 달 총 출금', value: fmt(expense), color: 'text-red-500', bg: 'bg-red-50 border-red-100' },
    { label: '현재 법인 잔액', value: fmt(balance), color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
    { label: '이번 달 고정지출', value: fmt(fixedTotal), color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
    { label: '이번 달 변동지출', value: fmt(varTotal), color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
    { label: '이번 달 순이익', value: fmt(profit), color: profit >= 0 ? 'text-green-600' : 'text-red-500', bg: profit >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100' },
  ]

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">그린홈시스 회계관리</h1>
        <p className="text-sm text-gray-400 mt-1">법인통장 인트라넷 대시보드 · {thisMonth}</p>
      </div>
      {loading ? (
        <div className="text-center py-20 text-gray-400">데이터 불러오는 중...</div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {cards.map((card, i) => (
            <div key={i} className={`rounded-xl p-6 border ${card.bg}`}>
              <p className="text-sm text-gray-500 mb-2">{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}