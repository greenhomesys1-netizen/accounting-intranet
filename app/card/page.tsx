'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

type CardSale = {
  id: string
  transaction_date: string
  card_number: string
  card_type: string
  card_company: string
  amount: number
  installment: string
  approval_number: string
  expected_date: string
  fee: number
  expected_amount: number
  deposit_amount: number
  deposit_date: string | null
  customer_name: string
  sales_person: string
  is_deposited: boolean
}

export default function CardPage() {
  const [list, setList] = useState<CardSale[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'done'>('all')
  const [filterYear, setFilterYear] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')
  const [editId, setEditId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const thisYear = new Date().getFullYear()
  const years = ['all', ...Array.from({length: 3}, (_, i) => String(thisYear - i))]
  const months = ['all', ...Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0'))]

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data } = await supabase
      .from('card_sales')
      .select('*')
      .order('transaction_date', { ascending: false })
    if (data) setList(data)
  }

  const filteredList = list.filter(item => {
    if (filterStatus === 'pending' && item.is_deposited) return false
    if (filterStatus === 'done' && !item.is_deposited) return false
    if (filterYear !== 'all' && !item.transaction_date.startsWith(filterYear)) return false
    if (filterMonth !== 'all') {
      const ym = `${filterYear === 'all' ? '' : filterYear + '-'}${filterMonth}`
      if (filterYear !== 'all' && !item.transaction_date.startsWith(`${filterYear}-${filterMonth}`)) return false
      if (filterYear === 'all') {
        const month = item.transaction_date.slice(5, 7)
        if (month !== filterMonth) return false
      }
    }
    return true
  })

  const totalExpected = filteredList.reduce((s, i) => s + i.expected_amount, 0)
  const pendingCount = list.filter(i => !i.is_deposited).length
  const doneCount = list.filter(i => i.is_deposited).length

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
        const ws = wb.Sheets['카드승인 리스트']
        if (!ws) { alert('카드승인 리스트 시트를 찾을 수 없어요!'); setUploading(false); return }

        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]

        let headerRow = -1
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i][0] === '거래일시') { headerRow = i; break }
        }
        if (headerRow === -1) { alert('헤더를 찾을 수 없어요!'); setUploading(false); return }

        const items = []
        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[0]) continue

          const transactionDate = String(row[0] || '').trim()
          const cardNumber = String(row[2] || '').trim()
          const cardType = String(row[3] || '').trim()
          const cardCompany = String(row[4] || '').trim()
          const merchantNumber = String(row[6] || '').trim()
          const amount = parseInt(String(row[7] || '0').replace(/,/g, '')) || 0
          const installment = String(row[8] || '일시불').trim()
          const approvalNumber = String(row[9] || '').trim()
          const expectedDate = String(row[12] || '').trim()
          const fee = parseInt(String(row[15] || '0').replace(/,/g, '')) || 0
          const expectedAmount = parseInt(String(row[16] || '0').replace(/,/g, '')) || 0
          const depositAmount = parseInt(String(row[17] || '0').replace(/,/g, '')) || 0
          const customerName = String(row[19] || '').trim()
          const salesPerson = String(row[20] || '').trim()

          const approvalResult = String(row[13] || '').trim()
          if (approvalResult === '취소') continue
          if (amount === 0) continue

          let depositDate = null
          const rawDepositDate = row[18]
          if (rawDepositDate && rawDepositDate !== '' && rawDepositDate !== '    -  -  ') {
            if (rawDepositDate instanceof Date) {
              depositDate = rawDepositDate.toISOString().split('T')[0]
            } else {
              const s = String(rawDepositDate).trim()
              if (s && s !== '-' && s.length > 4) depositDate = s
            }
          }

          items.push({
            transaction_date: transactionDate,
            card_number: cardNumber,
            card_type: cardType,
            card_company: cardCompany,
            merchant_number: merchantNumber,
            amount,
            installment,
            approval_number: approvalNumber,
            expected_date: expectedDate,
            fee,
            expected_amount: expectedAmount,
            deposit_amount: depositAmount,
            deposit_date: depositDate,
            customer_name: customerName,
            sales_person: salesPerson,
            is_deposited: depositDate !== null,
          })
        }

        await supabase.from('card_sales').delete().neq('id', '00000000-0000-0000-0000-000000000000')

        let inserted = 0
        for (let i = 0; i < items.length; i += 100) {
          const chunk = items.slice(i, i + 100)
          const { error } = await supabase.from('card_sales').insert(chunk)
          if (!error) inserted += chunk.length
        }

        setUploadResult(`✅ ${inserted}건 업로드 완료!`)
        await fetchData()
      } catch (err) {
        setUploadResult('❌ 업로드 실패: ' + String(err))
      }
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDepositSave = async (item: CardSale) => {
    if (!editDate) { alert('입금일자를 입력해주세요!'); return }
    setSaving(true)

    await supabase.from('card_sales').update({
      deposit_date: editDate,
      deposit_amount: item.expected_amount,
      is_deposited: true,
    }).eq('id', item.id)

    const { data: lastTx } = await supabase
      .from('transactions')
      .select('balance')
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
    const lastBalance = lastTx && lastTx.length > 0 ? lastTx[0].balance : 0

    await supabase.from('transactions').insert({
      date: editDate,
      category: '카드매출',
      description: item.customer_name || item.card_number,
      evidence_type: '카드승인',
      income: item.expected_amount,
      expense: 0,
      balance: lastBalance + item.expected_amount,
      note: `카드승인번호: ${item.approval_number} / 수수료: ${item.fee.toLocaleString()}원`,
    })

    setEditId(null)
    setEditDate('')
    setSaving(false)
    await fetchData()
    alert(`✅ 입금 반영 완료!\n자금현황 원장에도 자동 추가됐어요.`)
  }

  const fmt = (n: number) => n.toLocaleString('ko-KR')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">카드매출 관리</h1>
          <p className="text-sm text-gray-400 mt-1">카드 승인 내역 및 현금화 입금 관리</p>
        </div>
        <label className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer">
          {uploading ? '업로드 중...' : '📂 KICC 엑셀 업로드'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} disabled={uploading} />
        </label>
      </div>

      {uploadResult && (
        <div className={`px-4 py-3 rounded-lg mb-4 text-sm ${uploadResult.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {uploadResult}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-gray-500">전체 승인건수</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{list.length}건</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
          <p className="text-xs text-gray-500">미입금</p>
          <p className="text-xl font-bold text-orange-500 mt-1">{pendingCount}건</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-gray-500">입금완료</p>
          <p className="text-xl font-bold text-green-600 mt-1">{doneCount}건</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <p className="text-xs text-gray-500">조회 입금예정 합계</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{fmt(totalExpected)}원</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-4 flex-wrap items-center bg-white border rounded-xl px-4 py-3">
        <span className="text-sm text-gray-500 font-medium">조회기간</span>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="all">전체 연도</option>
          {years.filter(y => y !== 'all').map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="all">전체 월</option>
          {months.filter(m => m !== 'all').map(m => <option key={m} value={m}>{parseInt(m)}월</option>)}
        </select>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {(['all', 'pending', 'done'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-50 border text-gray-600 hover:bg-gray-100'}`}>
            {s === 'all' ? '전체' : s === 'pending' ? '⏳ 미입금' : '✅ 입금완료'}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-1">{filteredList.length}건</span>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium">거래일시</th>
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium">고객명</th>
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium">카드사</th>
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium">카드번호</th>
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium">할부</th>
              <th className="px-3 py-3 text-right text-xs text-gray-500 font-medium">승인금액</th>
              <th className="px-3 py-3 text-right text-xs text-gray-500 font-medium">수수료</th>
              <th className="px-3 py-3 text-right text-xs text-gray-500 font-medium">입금예정액</th>
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium">입금예정일</th>
              <th className="px-3 py-3 text-left text-xs text-gray-500 font-medium">담당자</th>
              <th className="px-3 py-3 text-center text-xs text-gray-500 font-medium">상태</th>
              <th className="px-3 py-3 text-center text-xs text-gray-500 font-medium">입금처리</th>
            </tr>
          </thead>
          <tbody>
            {filteredList.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-12 text-gray-400">
                데이터가 없어요. KICC 엑셀 업로드 버튼을 눌러 업로드하세요.
              </td></tr>
            ) : (
              filteredList.map(item => (
                <tr key={item.id} className={`border-b hover:bg-gray-50 ${item.is_deposited ? 'bg-green-50/20' : ''}`}>
                  <td className="px-3 py-3 text-gray-600 text-xs">{item.transaction_date.slice(0, 10)}</td>
                  <td className="px-3 py-3 text-gray-800 font-medium">{item.customer_name}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{item.card_company}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{item.card_number}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{item.installment}</td>
                  <td className="px-3 py-3 text-right font-medium text-gray-800">{fmt(item.amount)}</td>
                  <td className="px-3 py-3 text-right text-red-400 text-xs">{fmt(item.fee)}</td>
                  <td className="px-3 py-3 text-right font-medium text-blue-600">{fmt(item.expected_amount)}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{item.expected_date}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{item.sales_person}</td>
                  <td className="px-3 py-3 text-center">
                    {item.is_deposited ? (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">✅ {item.deposit_date}</span>
                    ) : (
                      <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded text-xs">⏳ 미입금</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {!item.is_deposited && (
                      editId === item.id ? (
                        <div className="flex gap-1 items-center justify-center">
                          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                            className="border rounded px-2 py-1 text-xs w-32" />
                          <button onClick={() => handleDepositSave(item)} disabled={saving}
                            className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">
                            {saving ? '...' : '확인'}
                          </button>
                          <button onClick={() => { setEditId(null); setEditDate('') }}
                            className="border px-2 py-1 rounded text-xs text-gray-500">취소</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditId(item.id); setEditDate(item.expected_date || '') }}
                          className="bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1 rounded text-xs hover:bg-blue-100">
                          입금처리
                        </button>
                      )
                    )}
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
