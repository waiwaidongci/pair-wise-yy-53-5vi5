import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HoldRequest, LicenseWindow, RequeueRecord, RightsComment, Territory } from '@/lib/types'
import { initialComments, initialHolds, initialWindows } from '@/lib/mock-data'
import { findConflicts, shiftWindow } from '@/lib/rules'
import { bookHold, releaseHold, reevaluateHolds, retryHold } from '@/lib/ledger'
import type { BookResult, HoldDraft } from '@/lib/ledger'

const HOLD_TERM_KEYS: (keyof LicenseWindow)[] = ['start', 'end', 'territory', 'channel', 'exclusive', 'sublicense', 'rights']

interface RightsState {
  windows: LicenseWindow[]
  comments: RightsComment[]
  holds: HoldRequest[]
  requeueLog: RequeueRecord[]
  operatorTerritory: Territory
  selectedWindowId: string
  selectedTerritory: string
  version: number
  updateWindow: (id: string, patch: Partial<LicenseWindow>) => void
  batchShift: (ids: string[], days: number) => void
  acceptComment: (id: string) => void
  selectWindow: (id: string) => void
  setOperatorTerritory: (territory: Territory) => void
  submitHold: (draft: HoldDraft) => BookResult
  retryHoldByNo: (requestNo: string) => BookResult
  releaseHoldDays: (requestNo: string, days: number) => { released: number; promoted: string[] }
  reset: () => void
}

export const useRightsStore = create<RightsState>()(
  persist(
    (set) => ({
      windows: initialWindows,
      comments: initialComments,
      holds: initialHolds,
      requeueLog: [],
      operatorTerritory: '中国大陆',
      selectedWindowId: 'RW-102',
      selectedTerritory: '全部地区',
      version: 18,
      updateWindow: (id, patch) => set((state) => {
        const before = state.windows.find((item) => item.id === id)
        const windows: LicenseWindow[] = state.windows.map((item) => item.id === id ? { ...item, ...patch, status: '草案' } : item)
        let holds = state.holds
        let requeueLog = state.requeueLog
        // 窗口条款变化：受影响档位的临时占档立即作废重排，已确认的正式授权不动
        if (before && HOLD_TERM_KEYS.some((key) => key in patch)) {
          const after = { ...before, ...patch }
          const scopes = [{ workId: before.workId, territory: before.territory, channel: before.channel }]
          if (after.workId !== before.workId || after.territory !== before.territory || after.channel !== before.channel) scopes.push({ workId: after.workId, territory: after.territory, channel: after.channel })
          for (const scope of scopes) {
            const result = reevaluateHolds(holds, scope, `授权窗口 ${id} 条款变更`, { operatorTerritory: state.operatorTerritory, operator: '系统重排' })
            holds = result.holds
            requeueLog = [...requeueLog, ...result.requeues]
          }
        }
        return { windows, holds, requeueLog, version: state.version + 1 }
      }),
      batchShift: (ids, days) => set((state) => {
        const shifted = state.windows.filter((item) => ids.includes(item.id))
        const windows = state.windows.map((item) => ids.includes(item.id) ? shiftWindow(item, days) : item)
        let holds = state.holds
        let requeueLog = state.requeueLog
        for (const win of shifted) {
          const result = reevaluateHolds(holds, { workId: win.workId, territory: win.territory, channel: win.channel }, `授权窗口 ${win.id} 批量调窗 ${days > 0 ? '+' : ''}${days} 天`, { operatorTerritory: state.operatorTerritory, operator: '系统重排' })
          holds = result.holds
          requeueLog = [...requeueLog, ...result.requeues]
        }
        return { windows, holds, requeueLog, version: state.version + 1 }
      }),
      acceptComment: (id) => set((state) => {
        const comment = state.comments.find((item) => item.id === id)
        if (!comment || comment.resolved) return {}
        const comments = state.comments.map((item) => item.id === id ? { ...item, resolved: true } : item)
        // 条款意见合并：该渠道受影响档位的临时占档作废重排
        const result = reevaluateHolds(state.holds, { channel: comment.channel }, `条款意见 ${id} 已合并，授权条款变化`, { operatorTerritory: state.operatorTerritory, operator: '系统重排' })
        return { comments, holds: result.holds, requeueLog: [...state.requeueLog, ...result.requeues], version: state.version + 1 }
      }),
      selectWindow: (id) => set({ selectedWindowId: id }),
      setOperatorTerritory: (territory) => set({ operatorTerritory: territory }),
      submitHold: (draft) => {
        let result!: BookResult
        set((state) => {
          result = bookHold(state.holds, draft, { operatorTerritory: state.operatorTerritory, operator: draft.owner })
          return { holds: result.holds, version: state.version + 1 }
        })
        return result
      },
      retryHoldByNo: (requestNo) => {
        let result!: BookResult
        set((state) => {
          result = retryHold(state.holds, requestNo, { operatorTerritory: state.operatorTerritory, operator: '按请求号重试' })
          return { holds: result.holds, version: state.version + 1 }
        })
        return result
      },
      releaseHoldDays: (requestNo, days) => {
        let outcome!: { released: number; promoted: string[] }
        set((state) => {
          const result = releaseHold(state.holds, requestNo, days, { operatorTerritory: state.operatorTerritory, operator: '当前操作人' })
          outcome = { released: result.released, promoted: result.promoted }
          return { holds: result.holds, version: state.version + 1 }
        })
        return outcome
      },
      reset: () => set({ windows: initialWindows, comments: initialComments, holds: initialHolds, requeueLog: [], version: 18 }),
    }),
    { name: 'yy53-rights-draft-v1', version: 2, migrate: (persisted) => persisted as RightsState },
  ),
)

export function useConflicts() {
  const windows = useRightsStore((state) => state.windows)
  return findConflicts(windows)
}
