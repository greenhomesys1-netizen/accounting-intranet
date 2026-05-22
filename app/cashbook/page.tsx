'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const 계정목록 = ['제품매출금','카드매출','외주용역비','급여','복리후생비','광고선전비','접대비','여비교통비','임차료','관리비','통신비','세금과공과금','지급수수료','자금이체','기타']
const 증빙목록 = ['세금계산서','현금영수증','카드승인','원천세납부서','기타(증빙없음)']

type Transaction = {
  id: string
  date: string
  category: string
  description: string
  evidence_type: string
  income: number
  expense: number
  balance: number
  note: string
}

export default function CashbookPage() {
  const today = new Date().toISOString().split('T')[0]
  const thisYear = new Date().getFullYear()
  const thisMonth = new Date().getMonth() + 1

  const [list, setList] = useState<Transaction[]>([])
  const [latestBalance, setLatestBalance] = useState<number>(0)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Transaction|null>(null)
  const [type, setType] = useState<'income'|'expense'>('income')
  const [form, setForm] = useState({ date: today, category: '', description: '', evidence_type: '', amount: '', note: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [filterYear, setFilterYear] = useState(String(thisYear))
  const [filterMonth, setFilterMonth] = useState(String(thisMonth))
  const fileRef = useRef<HTMLInputElement>(null)

  const fmt = (n: number) => n === 0 ? '-' : n.toLocaleString('ko-KR')

  // 검색 필터 적용
  const filteredList = list.filter(item => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      item.description?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.evidence_type?.toLowerCase().includes(q) ||
      item.note?.toLowerCase().includes(q) ||
      String(item.income).includes(q.replace(/,/g,'')) ||
      String(item.expense).includes(q.replace(/,/g,''))
    )
  })

  const totalIncome = filteredList.reduce((s,i) => s+i.income, 0)
  const totalExpense = filteredList.reduce((s,i) => s+i.expense, 0)

  const handleAmountChange = (value: string) => {
    const raw = value.replace(/,/g, '')
    if (!isNaN(Number(raw))) setForm({...form, amount: raw})
  }
  const displayAmount = form.amount ? Number(form.amount).toLocaleString('ko-KR') : ''

  useEffect(() => { fetchData() }, [filterYear, filterMonth])

  const fetchData = async () => {
    const ym = `${filterYear}-${String(filterMonth).padStart(2,'0')}`
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', `${ym}-01`)
      .lte('date', `${ym}-31`)
      .order('date', { ascending: false })  //
      .order('id', { ascending: false })    //
    if (data) setList(data)

    // 상단 잔액: DB 전체에서 가장 마지막 잔액 가져오기
    const { data: lastTx } = await supabase
      .from('transactions')
      .select('balance')
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
    if (lastTx && lastTx.length > 0) setLatestBalance(lastTx[0].balance)
  }

  const resetForm = () => {
    setForm({ date: today, category: '', description: '', evidence_type: '', amount: '', note: '' })
    setEditItem(null); setType('income'); setShowForm(false)
  }

  const handleSave = async () => {
    if (!form.date || !form.category || !form.description || !form.amount) {
      alert('날짜, 계정, 거래내용, 금액은 필수입니다!'); return
    }
    setLoading(true)
    const amt = parseInt(form.amount)
    if (editItem) {
      await supabase.from('transactions').update({
        date: form.date, category: form.category, description: form.description,
        evidence_type: form.evidence_type, note: form.note,
        income: type === 'income' ? amt : 0,
        expense: type === 'expense' ? amt : 0,
      }).eq('id', editItem.id)
    } else {
      // 가장 마지막 거래의 잔액 가져오기 (날짜+id 기준)
      const { data: lastTx } = await supabase
        .from('transactions')
        .select('balance')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
      const lastBalance = lastTx && lastTx.length > 0 ? lastTx[0].balance : 0
      const newBalance = type === 'income' ? lastBalance + amt : lastBalance - amt
      await supabase.from('transactions').insert({
        date: form.date, category: form.category, description: form.description,
        evidence_type: form.evidence_type, note: form.note,
        income: type === 'income' ? amt : 0,
        expense: type === 'expense' ? amt : 0,
        balance: newBalance,
      })
    }
    await fetchData(); resetForm(); setSaved(true)
    setTimeout(() => setSaved(false), 2000); setLoading(false)
  }

  const handleEdit = (item: Transaction) => {
    setEditItem(item); setType(item.income > 0 ? 'income' : 'expense')
    setForm({ date: item.date, category: item.category, description: item.description,
      evidence_type: item.evidence_type, note: item.note,
      amount: String(item.income > 0 ? item.income : item.expense) })
    setShowForm(true); window.scrollTo(0, 0)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 거래를 삭제할까요?')) return
    await supabase.from('transactions').delete().eq('id', id)
    await fetchData()
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult('')

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets['자금현황']
        if (!ws) { alert('자금현황 시트를 찾을 수 없어요!'); setUploading(false); return }

        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]

        const items = []
        

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[0]) continue

          const rawDate = row[0]
          let dateStr = ''
          if (rawDate instanceof Date) {
            dateStr = rawDate.toISOString().split('T')[0]
          } else if (typeof rawDate === 'string') {
            dateStr = rawDate.replace(/\./g, '-').trim()
            if (dateStr.endsWith('-')) dateStr = dateStr.slice(0, -1)
          }
          if (!dateStr || dateStr.length < 8) continue

          const category = String(row[2] || '').trim()
          const description = String(row[3] || row[4] || '').trim()
          const evidenceType = String(row[5] || '기타(증빙없음)').trim()
          const income = parseFloat(String(row[6] || '0').replace(/,/g, '')) || 0
          const expense = parseFloat(String(row[7] || '0').replace(/,/g, '')) || 0
          const note = String(row[11] || '').trim()

          if (!category && income === 0 && expense === 0) continue

          const balanceRaw = row[8]
          const balance = balanceRaw ? parseFloat(String(balanceRaw).replace(/,/g,'')) || 0 : 0

          items.push({
            date: dateStr,
            category: category || '기타',
            description: description || '-',
            evidence_type: evidenceType,
            income,
            expense,
            balance,
            note,
          })
        }

        let inserted = 0
        for (let i = 0; i < items.length; i += 100) {
          const chunk = items.slice(i, i + 100)
          const { error } = await supabase.from('transactions').insert(chunk)
          if (!error) inserted += chunk.length
        }

        setUploadResult(`✅ ${inserted}건 업로드 완료! (전체 ${items.length}건)`)
        await fetchData()
      } catch (err) {
        setUploadResult('❌ 업로드 실패: ' + String(err))
      }
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  const years = Array.from({length: 5}, (_, i) => String(thisYear - i))
  const months = Array.from({length: 12}, (_, i) => String(i + 1))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">자금현황 원장</h1>
          <p className="text-sm text-gray-400 mt-1">법인통장 입출금 내역을 날짜별로 입력합니다</p>
        </div>
        <div className="flex gap-3">
          <label className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer">
            {uploading ? '업로드 중...' : '📂 엑셀 업로드'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} disabled={uploading} />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + 거래 입력
          </button>
        </div>
      </div>

      {uploadResult && (
        <div className={`px-4 py-3 rounded-lg mb-4 text-sm ${uploadResult.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {uploadResult}
        </div>
      )}

      {/* 월별 필터 + 검색 */}
      <div className="flex items-center gap-3 mb-6 bg-white border rounded-xl px-4 py-3 flex-wrap">
        <span className="text-sm text-gray-500 font-medium">조회 기간</span>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          {years.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          {months.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <span className="text-xs text-gray-400">{filteredList.length}건</span>
        <div className="flex-1 min-w-48">
          <input
            type="text"
            placeholder="🔍 거래내용, 계정, 금액 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-xs text-gray-400 hover:text-gray-600">✕ 초기화</button>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-gray-500">총 입금</p>
          <p className="text-xl font-bold text-green-600 mt-1">{totalIncome.toLocaleString()}원</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-gray-500">총 출금</p>
          <p className="text-xl font-bold text-red-500 mt-1">{totalExpense.toLocaleString()}원</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-gray-500">잔액</p>
          <p className="text-xl font-bold text-blue-600 mt-1">
            {latestBalance.toLocaleString()}원
          </p>
        </div>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">
          ✅ 저장됐어요!
        </div>
      )}

      {/* 입력 폼 */}
      {showForm && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <h2 className="font-bold text-gray-800 mb-4">{editItem ? '✏️ 거래 수정' : '거래 내역 입력'}</h2>
          <div className="flex gap-3 mb-4">
            <button onClick={() => setType('income')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${type === 'income' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-500'}`}>
              입금
            </button>
            <button onClick={() => setType('expense')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors ${type === 'expense' ? 'bg-red-50 border-red-500 text-red-600' : 'border-gray-200 text-gray-500'}`}>
              출금
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">날짜 *</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">금액 * (원)</label>
              <input type="text" placeholder="0" value={displayAmount}
                onChange={e => handleAmountChange(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">계정 *</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">선택</option>
                {계정목록.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">증빙유형</label>
              <select value={form.evidence_type} onChange={e => setForm({...form, evidence_type: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">선택</option>
                {증빙목록.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">거래내용 *</label>
              <input type="text" placeholder="거래처명 또는 내용" value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">비고</label>
              <input type="text" placeholder="메모" value={form.note}
                onChange={e => setForm({...form, note: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={loading}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? '저장 중...' : editItem ? '수정 완료' : '저장'}
            </button>
            <button onClick={resetForm} className="border px-6 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
          </div>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">날짜</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">계정</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">거래내용</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">증빙</th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">입금</th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">출금</th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">잔액</th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredList.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                {searchQuery ? `"${searchQuery}" 검색 결과가 없습니다.` : '거래 내역이 없습니다. 엑셀 업로드 또는 직접 입력하세요.'}
              </td></tr>
            ) : (
              filteredList.map((item) => (
                <tr key={item.id} className={`border-b hover:bg-gray-50 ${item.income > 0 ? 'bg-green-50/20' : ''}`}>
                  <td className="px-4 py-3 text-gray-600">{item.date}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">{item.category}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{item.description}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{item.evidence_type}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(item.income)}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-500">{fmt(item.expense)}</td>
                  <td className="px-4 py-3 text-right font-medium text-blue-600">{item.balance.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleEdit(item)} className="text-blue-500 hover:text-blue-700 text-xs mr-3">수정</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
