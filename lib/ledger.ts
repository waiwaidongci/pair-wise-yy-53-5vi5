import type { HoldRequest, HoldSource, HoldStatus, RequeueRecord, Territory } from './types'

export interface HoldDraft {
  requestNo?: string
  workId: string
  work: string
  channel: string
  territory: Territory
  start: string
  end: string
  owner: string
  releaseDays: number
  source?: HoldSource
  arrivedAt?: string
}

export interface LedgerCtx {
  operatorTerritory: Territory
  operator: string
  now?: string
}

export interface OccupiedSlice {
  requestNo: string
  owner: string
  source: HoldSource
  status: HoldStatus
  start: string
  end: string
  days: number
  releaseDays: number
}

export type BookOutcome = '占位成功' | '排队待排' | '重复占位' | '权限拒绝' | '日期无效' | '未找到'

export interface BookResult {
  holds: HoldRequest[]
  hold?: HoldRequest
  outcome: BookOutcome
  occupied: OccupiedSlice[]
  message: string
}

export interface AffectedScope {
  workId?: string
  territory?: string
  channel?: string
}

const ACTIVE: HoldStatus[] = ['占位中', '已确认']

export const isActiveHold = (hold: HoldRequest) => ACTIVE.includes(hold.status)

export const slotKey = (hold: { workId: string; territory: string; channel: string }) => `${hold.workId}|${hold.territory}|${hold.channel}`

export const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start <= b.end && b.start <= a.end

export function dayCount(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1)
}

export function shiftDate(date: string, days: number) {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value.toISOString().slice(0, 10)
}

const byArrival = (a: HoldRequest, b: HoldRequest) => (a.arrivedAt === b.arrivedAt ? a.seq - b.seq : a.arrivedAt < b.arrivedAt ? -1 : 1)

function nextId(holds: HoldRequest[]) {
  const max = holds.reduce((acc, hold) => Math.max(acc, Number(hold.id.replace(/\D/g, '')) || 0), 0)
  return `HD-${String(max + 1).padStart(3, '0')}`
}

function nextSeq(holds: HoldRequest[]) {
  return holds.reduce((acc, hold) => Math.max(acc, hold.seq), 0) + 1
}

export function nextRequestNo(holds: HoldRequest[]) {
  const max = holds.reduce((acc, hold) => {
    const match = /^RQ-2026-(\d+)$/.exec(hold.requestNo)
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 1000)
  return `RQ-2026-${max + 1}`
}

/** 同档期（作品 × 地区 × 渠道）内与请求日期重叠的有效占位，即“后面的人”能看到的被占日期与可释放天数 */
export function occupiedSlices(holds: HoldRequest[], slot: { workId: string; territory: string; channel: string; start: string; end: string }, excludeRequestNo?: string): OccupiedSlice[] {
  return holds
    .filter((hold) => isActiveHold(hold) && hold.requestNo !== excludeRequestNo && slotKey(hold) === slotKey(slot) && overlaps(hold, slot))
    .sort(byArrival)
    .map((hold) => {
      const start = hold.start > slot.start ? hold.start : slot.start
      const end = hold.end < slot.end ? hold.end : slot.end
      return { requestNo: hold.requestNo, owner: hold.owner, source: hold.source, status: hold.status, start, end, days: dayCount(start, end), releaseDays: hold.releaseDays }
    })
}

/** 排队中的请求当前撞到的冲突日 */
export function conflictSlicesFor(holds: HoldRequest[], hold: HoldRequest): OccupiedSlice[] {
  if (hold.status !== '待重排') return []
  return occupiedSlices(holds, hold, hold.requestNo)
}

/** 落账：按作品、地区、渠道占位；同档期按请求到达顺序；请求号幂等，不重复占位；跨地区权限拒绝 */
export function bookHold(holds: HoldRequest[], draft: HoldDraft, ctx: LedgerCtx): BookResult {
  const now = ctx.now ?? new Date().toISOString()
  if (draft.end < draft.start) return { holds, outcome: '日期无效', occupied: [], message: '占档结束日期不能早于开始日期。' }
  const requestNo = draft.requestNo?.trim() || nextRequestNo(holds)

  const duplicated = holds.filter((hold) => hold.requestNo === requestNo).find(isActiveHold)
  if (duplicated) return { holds, hold: duplicated, outcome: '重复占位', occupied: occupiedSlices(holds, draft, requestNo), message: `请求号 ${requestNo} 已存在有效占位（${duplicated.status}），按请求号去重，未重复落账。` }

  if (draft.territory !== ctx.operatorTerritory) {
    const reason = `跨地区处理被拒绝：操作地区「${ctx.operatorTerritory}」无权处理「${draft.territory}」的占档`
    const denied: HoldRequest = {
      id: nextId(holds), requestNo, workId: draft.workId, work: draft.work, channel: draft.channel, territory: draft.territory,
      start: draft.start, end: draft.end, arrivedAt: draft.arrivedAt ?? now, seq: nextSeq(holds), status: '已拒绝',
      source: draft.source ?? '临时占档', owner: draft.owner, releaseDays: draft.releaseDays, blockedBy: [], voidReason: reason,
      events: [{ time: now, actor: ctx.operator, action: '权限拒绝', detail: reason }],
    }
    return { holds: [...holds, denied], hold: denied, outcome: '权限拒绝', occupied: [], message: reason }
  }

  const occupied = occupiedSlices(holds, draft, requestNo)
  const status: HoldStatus = occupied.length ? '待重排' : '占位中'
  const detail = occupied.length
    ? `同档期已被 ${occupied.map((item) => item.requestNo).join('、')} 占用 ${occupied.map((item) => `${item.start}~${item.end}`).join('、')}，按到达顺序排队`
    : '同档期无有效占位，按到达顺序直接占位'
  const hold: HoldRequest = {
    id: nextId(holds), requestNo, workId: draft.workId, work: draft.work, channel: draft.channel, territory: draft.territory,
    start: draft.start, end: draft.end, arrivedAt: draft.arrivedAt ?? now, seq: nextSeq(holds), status,
    source: draft.source ?? '临时占档', owner: draft.owner, releaseDays: draft.releaseDays, blockedBy: occupied.map((item) => item.requestNo),
    events: [{ time: now, actor: ctx.operator, action: status === '占位中' ? '递交占位' : '递交排队', detail }],
  }
  const message = occupied.length
    ? `请求号 ${requestNo} 进入排队：被占日期 ${occupied.map((item) => `${item.start}~${item.end}（${item.days} 天）`).join('、')}，占用方可释放 ${occupied.map((item) => item.releaseDays).join('、')} 天。`
    : `请求号 ${requestNo} 占位成功。`
  return { holds: [...holds, hold], hold, outcome: status === '占位中' ? '占位成功' : '排队待排', occupied, message }
}

/** 失败后按请求号重试：已有有效占位则直接返回，不重复落账 */
export function retryHold(holds: HoldRequest[], requestNo: string, ctx: LedgerCtx): BookResult {
  const entries = holds.filter((hold) => hold.requestNo === requestNo).sort(byArrival)
  if (!entries.length) return { holds, outcome: '未找到', occupied: [], message: `请求号 ${requestNo} 不存在，请核对后重试。` }
  const active = entries.find(isActiveHold)
  if (active) return { holds, hold: active, outcome: '重复占位', occupied: [], message: `请求号 ${requestNo} 已有有效占位（${active.status}），未重复落账。` }
  const latest = entries[entries.length - 1]!
  return bookHold(holds, { ...latest, requestNo, arrivedAt: ctx.now }, ctx)
}

/** 窗口或条款意见变化：受影响档位的占位中/待重排请求立即作废，并按原到达顺序重排；已确认的正式授权不动 */
export function reevaluateHolds(holds: HoldRequest[], scope: AffectedScope, reason: string, ctx: LedgerCtx): { holds: HoldRequest[]; requeues: RequeueRecord[] } {
  const now = ctx.now ?? new Date().toISOString()
  const matches = (hold: HoldRequest) => (!scope.workId || hold.workId === scope.workId) && (!scope.territory || hold.territory === scope.territory) && (!scope.channel || hold.channel === scope.channel)
  const affected = holds.filter((hold) => matches(hold) && (hold.status === '占位中' || hold.status === '待重排')).sort(byArrival)
  if (!affected.length) return { holds, requeues: [] }

  const voidedIds = new Set(affected.map((hold) => hold.id))
  let next = holds.map((hold) => voidedIds.has(hold.id)
    ? { ...hold, status: '已作废' as HoldStatus, voidReason: reason, events: [...hold.events, { time: now, actor: ctx.operator, action: '作废', detail: reason }] }
    : hold)

  const requeues: RequeueRecord[] = []
  affected.forEach((old, index) => {
    const result = bookHold(next, {
      requestNo: old.requestNo, workId: old.workId, work: old.work, channel: old.channel, territory: old.territory,
      start: old.start, end: old.end, owner: old.owner, releaseDays: old.releaseDays, source: old.source, arrivedAt: old.arrivedAt,
    }, { ...ctx, operator: '系统重排', now })
    next = result.holds
    requeues.push({
      id: `RQG-${now.replace(/\D/g, '').slice(0, 14)}-${index + 1}`,
      requestNo: old.requestNo, reason, voidedId: old.id, newId: result.hold?.id,
      outcome: result.hold?.status ?? '已拒绝', time: now,
    })
  })
  return { holds: next, requeues }
}

/** 占用方释放天数：窗口尾部让出，同档期排队者按到达顺序补位 */
export function releaseHold(holds: HoldRequest[], requestNo: string, days: number, ctx: LedgerCtx): { holds: HoldRequest[]; released: number; promoted: string[] } {
  const now = ctx.now ?? new Date().toISOString()
  const target = holds.find((hold) => hold.requestNo === requestNo && hold.status === '占位中')
  if (!target) return { holds, released: 0, promoted: [] }
  const released = Math.min(days, target.releaseDays, dayCount(target.start, target.end) - 1)
  if (released <= 0) return { holds, released: 0, promoted: [] }

  const newEnd = shiftDate(target.end, -released)
  let next = holds.map((hold) => hold.id === target.id
    ? { ...hold, end: newEnd, releaseDays: hold.releaseDays - released, events: [...hold.events, { time: now, actor: ctx.operator, action: '释放天数', detail: `释放 ${released} 天，占档尾部让出至 ${newEnd}` }] }
    : hold)

  const promoted: string[] = []
  const queued = next.filter((hold) => hold.status === '待重排' && slotKey(hold) === slotKey(target)).sort(byArrival)
  for (const item of queued) {
    const occupied = occupiedSlices(next, item, item.requestNo)
    if (!occupied.length) {
      next = next.map((hold) => hold.id === item.id
        ? { ...hold, status: '占位中' as HoldStatus, blockedBy: [], events: [...hold.events, { time: now, actor: '系统重排', action: '补位占位', detail: `因 ${requestNo} 释放 ${released} 天，排队请求按到达顺序补位` }] }
        : hold)
      promoted.push(item.requestNo)
    } else {
      next = next.map((hold) => hold.id === item.id ? { ...hold, blockedBy: occupied.map((slice) => slice.requestNo) } : hold)
    }
  }
  return { holds: next, released, promoted }
}

/** 旧数据没有请求号：按确认日期补录请求号并记为历史依据 */
export function backfillLegacy(holds: HoldRequest[]): HoldRequest[] {
  const counters: Record<string, number> = {}
  const sorted = [...holds].sort((a, b) => (a.confirmedAt ?? a.arrivedAt) < (b.confirmedAt ?? b.arrivedAt) ? -1 : 1)
  const assigned = new Map<string, string>()
  for (const hold of sorted) {
    if (hold.requestNo) continue
    const date = (hold.confirmedAt ?? hold.arrivedAt).slice(0, 10).replaceAll('-', '')
    counters[date] = (counters[date] ?? 0) + 1
    assigned.set(hold.id, `RQ-HIS-${date}-${String(counters[date]).padStart(2, '0')}`)
  }
  return holds.map((hold) => {
    const requestNo = assigned.get(hold.id)
    if (!requestNo) return hold
    const confirmedAt = (hold.confirmedAt ?? hold.arrivedAt).slice(0, 10)
    return {
      ...hold, requestNo, source: '历史补录' as HoldSource, status: '已确认' as HoldStatus, confirmedAt,
      note: `旧数据无请求号，按确认日期 ${confirmedAt} 补录为历史依据`,
      events: [...hold.events, { time: `${confirmedAt}T00:00:00`, actor: '系统补录', action: '历史补录', detail: `补录请求号 ${requestNo}，作为同档期准入的历史依据` }],
    }
  })
}
