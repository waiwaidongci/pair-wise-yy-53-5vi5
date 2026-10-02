import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HoldRequest, LicenseWindow, RearrangementLog, RightsComment, Territory } from '@/lib/types'
import { initialComments, initialWindows } from '@/lib/mock-data'
import { findConflicts, shiftWindow } from '@/lib/rules'
import { allocateHold, backfillLegacy, rearrangeForSource, commentLabel } from '@/lib/holds'

interface HoldInput {
  id?: string
  workId: string
  work: string
  territory: Territory
  channel: string
  start: string
  end: string
  sourceType?: '窗口' | '意见' | '手工'
  sourceId?: string
  sourceLabel?: string
  operator?: string
}

interface RightsState {
  windows: LicenseWindow[]
  comments: RightsComment[]
  holds: HoldRequest[]
  rearrangementLogs: RearrangementLog[]
  operatorRegion: Territory
  selectedWindowId: string
  selectedTerritory: string
  version: number
  updateWindow: (id: string, patch: Partial<LicenseWindow>) => void
  batchShift: (ids: string[], days: number) => void
  acceptComment: (id: string) => void
  submitHold: (input: HoldInput) => HoldRequest
  retryHold: (id: string) => void
  releaseHold: (id: string) => void
  voidHold: (id: string, reason: string) => void
  rearrangeForWindow: (windowId: string) => void
  rearrangeForComment: (commentId: string) => void
  setOperatorRegion: (region: Territory) => void
  selectWindow: (id: string) => void
  reset: () => void
}

export const useRightsStore = create<RightsState>()(
  persist(
    (set, get) => ({
      windows: initialWindows,
      comments: initialComments,
      holds: backfillLegacy(initialWindows),
      rearrangementLogs: [],
      operatorRegion: '中国大陆',
      selectedWindowId: 'RW-102',
      selectedTerritory: '全部地区',
      version: 18,

      updateWindow: (id, patch) => {
        set((state) => {
          const windows = state.windows.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...patch,
                  status: patch.status ?? '草案',
                  confirmedAt: patch.status === '已确认' ? new Date().toISOString().slice(0, 10) : item.confirmedAt,
                }
              : item,
          )
          // 窗口确认 → 其临时占档转为正式授权（已转正，不参与重排）
          let holds = state.holds
          if (patch.status === '已确认') {
            holds = holds.map((h) =>
              h.sourceType === '窗口' && h.sourceId === id && h.status === '占档中'
                ? { ...h, status: '已转正' as const, voidReason: undefined }
                : h,
            )
          }
          return { windows, holds, version: state.version + 1 }
        })
        get().rearrangeForWindow(id)
      },

      batchShift: (ids, days) => {
        set((state) => ({ windows: state.windows.map((item) => (ids.includes(item.id) ? shiftWindow(item, days) : item)), version: state.version + 1 }))
        ids.forEach((id) => get().rearrangeForWindow(id))
      },

      acceptComment: (id) => {
        set((state) => ({ comments: state.comments.map((item) => (item.id === id ? { ...item, resolved: true } : item)), version: state.version + 1 }))
        get().rearrangeForComment(id)
      },

      submitHold: (input) => {
        let created: HoldRequest | undefined
        set((state) => {
          // 幂等：请求号已存在则不重复占位
          if (input.id && state.holds.some((h) => h.id === input.id)) {
            created = state.holds.find((h) => h.id === input.id)
            return state
          }
          const arrival = state.holds.reduce((max, h) => Math.max(max, h.arrival), 0) + 1
          const base: HoldRequest = {
            id: input.id ?? `HOLD-${new Date().getFullYear()}-${String(state.holds.length + 1).padStart(4, '0')}`,
            workId: input.workId,
            work: input.work,
            territory: input.territory,
            channel: input.channel,
            start: input.start,
            end: input.end,
            status: '申请失败',
            arrival,
            arrivedAt: new Date().toISOString(),
            sourceType: input.sourceType ?? '手工',
            sourceId: input.sourceId,
            sourceLabel: input.sourceLabel ?? '手工占档',
            operator: input.operator ?? '我',
            operatorRegion: state.operatorRegion,
            grantedDays: [],
            occupiedDays: 0,
            releasableDays: 0,
            conflictDays: [],
          }
          // 跨地区处理 → 权限拒绝
          if (input.territory !== state.operatorRegion) {
            created = { ...base, voidReason: `跨地区处理权限拒绝：操作人授权地区为 ${state.operatorRegion}，不得在 ${input.territory} 落账` }
            return { holds: [...state.holds, created] }
          }
          const result = allocateHold(base, state.holds)
          created = {
            ...base,
            status: result.status,
            grantedStart: result.grantedStart,
            grantedEnd: result.grantedEnd,
            grantedDays: result.grantedDays,
            occupiedDays: result.occupiedDays,
            releasableDays: result.releasableDays,
            conflictDays: result.conflictDays,
          }
          return { holds: [...state.holds, created] }
        })
        return created!
      },

      retryHold: (id) => {
        set((state) => {
          const target = state.holds.find((h) => h.id === id)
          if (!target || target.status !== '申请失败') return state
          // 跨地区拒绝的重试：若操作地区已切换到该地区，则重新占位；否则保持拒绝
          if (target.territory !== state.operatorRegion) {
            return {
              holds: state.holds.map((h) =>
                h.id === id
                  ? { ...h, voidReason: `跨地区处理权限拒绝：操作人授权地区为 ${state.operatorRegion}，不得在 ${target.territory} 落账`, retryOf: h.retryOf ?? h.id }
                  : h,
              ),
            }
          }
          const result = allocateHold(target, state.holds)
          return {
            holds: state.holds.map((h) =>
              h.id === id
                ? {
                    ...h,
                    status: result.status,
                    grantedStart: result.grantedStart,
                    grantedEnd: result.grantedEnd,
                    grantedDays: result.grantedDays,
                    occupiedDays: result.occupiedDays,
                    releasableDays: result.releasableDays,
                    conflictDays: result.conflictDays,
                    voidReason: undefined,
                    retryOf: h.retryOf ?? h.id,
                  }
                : h,
            ),
          }
        })
      },

      releaseHold: (id) => set((state) => ({
        holds: state.holds.map((h) => (h.id === id ? { ...h, status: '已释放' as const, voidReason: '人工释放档期' } : h)),
      })),

      voidHold: (id, reason) => set((state) => ({
        holds: state.holds.map((h) => (h.id === id ? { ...h, status: '已作废' as const, voidReason: reason } : h)),
      })),

      rearrangeForWindow: (windowId) => {
        set((state) => {
          const win = state.windows.find((w) => w.id === windowId)
          if (!win) return state
          const outcome = rearrangeForSource(
            state.holds,
            { type: '窗口', id: windowId, label: `窗口 ${windowId} · ${win.channel}`, at: new Date().toISOString() },
            state.windows,
          )
          return { holds: outcome.holds, rearrangementLogs: [outcome.log, ...state.rearrangementLogs] }
        })
      },

      rearrangeForComment: (commentId) => {
        set((state) => {
          const c = state.comments.find((item) => item.id === commentId)
          if (!c) return state
          const outcome = rearrangeForSource(
            state.holds,
            { type: '意见', id: commentId, label: commentLabel(c), at: new Date().toISOString() },
            state.windows,
          )
          return { holds: outcome.holds, rearrangementLogs: [outcome.log, ...state.rearrangementLogs] }
        })
      },

      setOperatorRegion: (region) => set({ operatorRegion: region }),
      selectWindow: (id) => set({ selectedWindowId: id }),
      reset: () => set({ windows: initialWindows, comments: initialComments, holds: backfillLegacy(initialWindows), rearrangementLogs: [], version: 18 }),
    }),
    { name: 'yy53-rights-draft-v1', version: 1 },
  ),
)

export function useConflicts() {
  const windows = useRightsStore((state) => state.windows)
  return findConflicts(windows)
}
