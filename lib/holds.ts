import type { HoldRequest, HoldStatus, LicenseWindow, RearrangementLog, RightsComment, Territory } from './types'

// ---------- 日期工具 ----------
export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`)
}
export function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}
export function eachDay(start: string, end: string): string[] {
  const days: string[] = []
  let cur = start
  while (cur <= end) {
    days.push(cur)
    cur = addDays(cur, 1)
  }
  return days
}
export function dayCount(start: string, end: string): number {
  return Math.max(0, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000) + 1)
}

// ---------- 占用状态 ----------
// 占档中 / 已转正 都实际占用日期；已作废 / 已释放 / 申请失败 不占
export function occupiesDates(status: HoldStatus): boolean {
  return status === '占档中' || status === '已转正'
}
// 可被重排的只有临时占档；已转正（正式授权）不受影响
export function isRearrangeable(status: HoldStatus): boolean {
  return status === '占档中'
}

// ---------- FIFO 占位 ----------
export interface AllocationResult {
  grantedDays: string[]
  occupiedDays: number
  releasableDays: number
  conflictDays: string[]
  grantedStart?: string
  grantedEnd?: string
  status: HoldStatus
}

/**
 * 按请求到达顺序占位：同作品、同地区的日期档，先到者先得。
 * 渠道仅作为落账维度，日期槽位按 作品×地区×日期 判定（与既有独占冲突规则一致）。
 */
export function allocateHold(
  req: { workId: string; territory: Territory; start: string; end: string },
  existing: HoldRequest[],
): AllocationResult {
  const requestDays = eachDay(req.start, req.end)
  const occupied = new Set<string>()
  for (const h of existing) {
    if (h.workId !== req.workId || h.territory !== req.territory) continue
    if (!occupiesDates(h.status)) continue
    const hDays = h.grantedDays.length ? h.grantedDays : eachDay(h.grantedStart ?? h.start, h.grantedEnd ?? h.end)
    for (const d of hDays) occupied.add(d)
  }
  const conflictDays = requestDays.filter((d) => occupied.has(d))
  const grantedDays = requestDays.filter((d) => !occupied.has(d))
  return {
    grantedDays,
    occupiedDays: conflictDays.length,
    releasableDays: grantedDays.length,
    conflictDays,
    grantedStart: grantedDays[0],
    grantedEnd: grantedDays[grantedDays.length - 1],
    status: grantedDays.length > 0 ? '占档中' : '申请失败',
  }
}

// ---------- 冲突日检测 ----------
export interface ConflictDay {
  date: string
  holdIds: string[]
  work: string
  territory: Territory
}

/** 找出同一作品、同一地区、同一日期被两个及以上有效占档占住的日期。 */
export function findConflictDays(holds: HoldRequest[]): ConflictDay[] {
  const map = new Map<string, ConflictDay>()
  for (const h of holds) {
    if (!occupiesDates(h.status)) continue
    const days = h.grantedDays.length ? h.grantedDays : eachDay(h.grantedStart ?? h.start, h.grantedEnd ?? h.end)
    for (const d of days) {
      const key = `${h.workId}|${h.territory}|${d}`
      const cur = map.get(key)
      if (cur) cur.holdIds.push(h.id)
      else map.set(key, { date: d, holdIds: [h.id], work: h.work, territory: h.territory })
    }
  }
  return Array.from(map.values()).filter((c) => c.holdIds.length > 1).sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- 重排 ----------
export interface RearrangeOutcome {
  holds: HoldRequest[]
  log: RearrangementLog
}

/**
 * 窗口或意见变化后，受影响的临时占档立即作废并按到达顺序重排。
 * 已转正的正式授权不受影响。
 */
export function rearrangeForSource(
  holds: HoldRequest[],
  trigger: { type: '窗口' | '意见'; id: string; label: string; at: string },
  windows: LicenseWindow[],
): RearrangeOutcome {
  const affected = holds.filter((h) => h.sourceType === trigger.type && h.sourceId === trigger.id && isRearrangeable(h.status))
  if (!affected.length) {
    return {
      holds,
      log: {
        id: `RR-${trigger.id}-${Date.now()}`,
        at: trigger.at,
        trigger: trigger.label,
        triggerType: trigger.type,
        triggerId: trigger.id,
        voided: [],
        created: [],
        summary: `${trigger.label} 变化，但没有受影响的临时占档（正式授权不受影响）。`,
      },
    }
  }

  // 先作废受影响占档
  let next = holds.map((h) =>
    affected.some((a) => a.id === h.id)
      ? { ...h, status: '已作废' as HoldStatus, voidReason: `${trigger.label} 变化，占档作废重排` }
      : h,
  )

  // 按到达顺序重排
  const created: HoldRequest[] = []
  const sorted = [...affected].sort((a, b) => a.arrival - b.arrival)
  for (const old of sorted) {
    // 窗口来源的占档，档期跟随窗口最新范围
    let start = old.start
    let end = old.end
    if (trigger.type === '窗口') {
      const win = windows.find((w) => w.id === trigger.id)
      if (win && win.workId === old.workId && win.territory === old.territory) {
        start = win.start
        end = win.end
      }
    }
    const result = allocateHold({ workId: old.workId, territory: old.territory, start, end }, next)
    const newId = `${old.id}-R${Date.now().toString(36).toUpperCase()}`
    const entry: HoldRequest = {
      ...old,
      id: newId,
      start,
      end,
      status: result.status,
      grantedStart: result.grantedStart,
      grantedEnd: result.grantedEnd,
      grantedDays: result.grantedDays,
      occupiedDays: result.occupiedDays,
      releasableDays: result.releasableDays,
      conflictDays: result.conflictDays,
      voidReason: undefined,
      rearrangedFrom: old.id,
      arrivedAt: trigger.at,
    }
    created.push(entry)
    next = [...next, entry]
  }

  const log: RearrangementLog = {
    id: `RR-${trigger.id}-${Date.now()}`,
    at: trigger.at,
    trigger: trigger.label,
    triggerType: trigger.type,
    triggerId: trigger.id,
    voided: affected.map((h) => h.id),
    created: created.map((h) => h.id),
    summary: `${trigger.label} 变化：作废 ${affected.length} 个临时占档，重排生成 ${created.length} 个（其中 ${created.filter((c) => c.status === '申请失败').length} 个无可用日期）。已确认正式授权未受影响。`,
  }
  return { holds: next, log }
}

// ---------- 历史补录 ----------
/**
 * 旧数据没有请求号时，按确认日期补成历史依据。
 * 仅补录已确认窗口，状态为已转正（正式授权，不参与重排）。
 */
export function backfillLegacy(windows: LicenseWindow[]): HoldRequest[] {
  return windows
    .filter((w) => w.status === '已确认')
    .map((w, idx) => {
      const basisDate = w.confirmedAt ?? addDays(w.start, -1)
      return {
        id: w.requestNo ?? `LEGACY-${w.id}`,
        workId: w.workId,
        work: w.work,
        territory: w.territory,
        channel: w.channel,
        start: w.start,
        end: w.end,
        status: '已转正' as HoldStatus,
        arrival: idx,
        arrivedAt: basisDate,
        sourceType: '窗口' as const,
        sourceId: w.id,
        sourceLabel: `历史补录 · ${w.id}`,
        operator: '历史数据',
        operatorRegion: w.territory,
        grantedStart: w.start,
        grantedEnd: w.end,
        grantedDays: eachDay(w.start, w.end),
        occupiedDays: 0,
        releasableDays: 0,
        conflictDays: [],
        legacy: true,
        basisDate,
      }
    })
}

// ---------- 请求号 ----------
export function nextRequestId(seq: number): string {
  return `HOLD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
}

// ---------- 统计 ----------
export function holdStats(holds: HoldRequest[]) {
  return {
    total: holds.length,
    active: holds.filter((h) => h.status === '占档中').length,
    confirmed: holds.filter((h) => h.status === '已转正').length,
    voided: holds.filter((h) => h.status === '已作废').length,
    failed: holds.filter((h) => h.status === '申请失败').length,
    released: holds.filter((h) => h.status === '已释放').length,
  }
}

export function commentLabel(c: RightsComment): string {
  return `意见 ${c.id} · ${c.anchor}`
}
