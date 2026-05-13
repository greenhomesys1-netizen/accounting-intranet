'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

type Transfer = {
  id: string
  date: string
  description: string
  bank: string
  amount: number
  type: 'out' | 'in'
  note: string
}

export default function TransferPage() {
  const [list, setList] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Transfer | null>(null)
  const [form, setForm] = useState({ date: '', description: '김상대', bank: '토스뱅크', amount: '', type: 'out' as 'out'|'in', note: '' })
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fmt = (n: number) => n.toLocaleString('ko-KR')
  const totalOut = list.filter(i => i.type === 'out').reduce((s, i) => s + i.amount, 0)
  const totalIn = list.filter(i => i.type === 'in').reduce((s, i) => s + i.amount, 0)
  const balance = totalIn - totalOut

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data } = await supabase.from('transfers').select('*').order('date', { ascending: false })
    if (data) setList(data)
    setLoading(false)
  }

  const resetForm = () => {
    setForm({ date: '', description: '김상대', bank: '토스뱅크', amount: '', type: 'out', note: '' })
    setEditItem(null); setShowForm(false)
  }

  const handleSave = async () => {
    if (!form.date || !form.amount) { alert('날짜와 금액은 필수입니다!'); return }
    const amt = parseInt(form.amount.replace(/,/g, ''))
    if (editItem) {
      await supabase.from('transfers').update({
        date: form.date, description: form.description, bank: form.bank,
        amount: amt, type: form.type, note: form.note
      }).eq('id', editItem.id)
    } else {
      await supabase.from('transfers').insert({
        date: form.date, description: form.description, bank: form.bank,
        amount: amt, type: form.type, note: form.note
      })
    }
    await fetchData(); resetForm(); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleEdit = (item: Transfer) => {
    setEditItem(item)
    setForm({ date: item.date, description: item.description, bank: item.bank,
      amount: String(item.amount), type: item.type, note: item.note })
    setShowForm(true); window.scrollTo(0, 0)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('삭제할까요?')) return
    await supabase.from('transfers').delete().eq('id', id)
    await fetchData()
  }

  // 엑셀 업로드
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
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][]

        const items: Omit<Transfer, 'id'>[] = []

        // 출금내역: A열(날짜), B열(거래내용), D열(은행), E열(출금액) - 5행부터
        for (let i = 4; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[0]) continue
          const rawDate = row[0]
          if (String(rawDate).includes('합')) continue

          let dateStr = ''
          if (rawDate instanceof Date) {
            dateStr = rawDate.toISOString().split('T')[0]
          } else {
            dateStr = String(rawDate).trim()
          }
          if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue

          const amount = parseFloat(String(row[4] || '0').replace(/,/g, '')) || 0
          if (amount <= 0) continue

          items.push({
            date: dateStr,
            description: String(row[1] || '김상대').trim(),
            bank: String(row[3] || '').trim(),
            amount,
            type: 'out',
            note: ''
          })
        }

        // 입금내역: G열(날짜), H열(거래내용), I열(은행), K열(입금액) - 5행부터
        for (let i = 4; i < rows.length; i++) {
          const row = rows[i]
          if (!row || !row[6]) continue
          const rawDate = row[6]
          if (String(rawDate).includes('합')) continue

          let dateStr = ''
          if (rawDate instanceof Date) {
            dateStr = rawDate.toISOString().split('T')[0]
          } else {
            dateStr = String(rawDate).trim()
          }
          if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue

          const amount = parseFloat(String(row[10] || '0').replace(/,/g, '')) || 0
          if (amount <= 0) continue

          items.push({
            date: dateStr,
            description: String(row[7] || '김상대').trim(),
            bank: String(row[8] || '').trim(),
            amount,
            type: 'in',
            note: ''
          })
        }

        let inserted = 0
        for (const item of items) {
          const { data: existing } = await supabase
            .from('transfers').select('id')
            .eq('date', item.date).eq('amount', item.amount).eq('type', item.type).limit(1)
          if (!existing || existing.length === 0) {
            const { error } = await supabase.from('transfers').insert(item)
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
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대표님 이체 관리</h1>
          <p className="text-sm text-gray-400 mt-1">법인 ↔ 김상대 대표님 입출금 내역</p>
        </div>
        <div className="flex gap-2">
          <label className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 cursor-pointer">
            {uploading ? '업로드 중...' : '📂 엑셀 업로드'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} disabled={uploading} />
          </label>
          <button onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + 직접 입력
          </button>
        </div>
      </div>

      {uploadResult && (
        <div className={`px-4 py-3 rounded-lg mb-4 text-sm ${uploadResult.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {uploadResult}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs text-gray-500">총 출금 (법인→대표)</p>
          <p className="text-xl font-bold text-red-500 mt-1">{fmt(totalOut)}원</p>
          <p className="text-xs text-gray-400 mt-1">{list.filter(i=>i.type==='out').length}건</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-gray-500">총 입금 (대표→법인)</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmt(totalIn)}원</p>
          <p className="text-xs text-gray-400 mt-1">{list.filter(i=>i.type==='in').length}건</p>
        </div>
        <div className={`border rounded-xl p-4 ${balance >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
          <p className="text-xs text-gray-500">미상환 잔액</p>
          <p className={`text-xl font-bold mt-1 ${balance >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>{fmt(Math.abs(balance))}원</p>
          <p className="text-xs text-gray-400 mt-1">{balance >= 0 ? '대표님이 더 입금' : '법인이 더 출금'}</p>
        </div>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">✅ 저장됐어요!</div>
      )}

      {/* 입력 폼 */}
      {showForm && (
        <div className="bg-white border rounded-xl p-6 mb-6">
          <h2 className="font-bold text-gray-800 mb-4">{editItem ? '✏️ 수정' : '거래 입력'}</h2>
          <div className="flex gap-3 mb-4">
            <button onClick={() => setForm({...form, type: 'out'})}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 ${form.type === 'out' ? 'bg-red-50 border-red-400 text-red-600' : 'border-gray-200 text-gray-500'}`}>
              출금 (법인→대표)
            </button>
            <button onClick={() => setForm({...form, type: 'in'})}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 ${form.type === 'in' ? 'bg-green-50 border-green-400 text-green-600' : 'border-gray-200 text-gray-500'}`}>
              입금 (대표→법인)
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">날짜 *</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">금액 *</label>
              <input type="text" placeholder="0" value={form.amount}
                onChange={e => setForm({...form, amount: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">거래내용</label>
              <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">은행</label>
              <input type="text" value={form.bank} onChange={e => setForm({...form, bank: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">비고</label>
              <input type="text" placeholder="메모" value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
              {editItem ? '수정 완료' : '저장'}
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
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">구분</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">거래내용</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">은행</th>
              <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">금액</th>
              <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">비고</th>
              <th className="px-4 py-3 text-center text-xs text-gray-500 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">불러오는 중...</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">거래 내역이 없습니다.</td></tr>
            ) : (
              list.map(item => (
                <tr key={item.id} className={`border-b hover:bg-gray-50 ${item.type === 'in' ? 'bg-green-50/20' : ''}`}>
                  <td className="px-4 py-3 text-gray-600">{item.date}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.type === 'out' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {item.type === 'out' ? '출금' : '입금'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{item.description}</td>
                  <td className="px-4 py-3 text-gray-500">{item.bank}</td>
                  <td className={`px-4 py-3 text-right font-medium ${item.type === 'out' ? 'text-red-500' : 'text-green-600'}`}>
                    {item.type === 'out' ? '-' : '+'}{fmt(item.amount)}원
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.note}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleEdit(item)} className="text-blue-500 text-xs mr-3">수정</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 text-xs">삭제</button>
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
