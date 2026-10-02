import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { initialComments, initialHolds, initialWindows } from '@/lib/mock-data'
import { findConflicts } from '@/lib/rules'
import { bookHold, retryHold } from '@/lib/ledger'
import type { HoldRequest } from '@/lib/types'
import type { Territory } from '@/lib/types'

const t = initTRPC.create()
const windowInput = z.object({
  channel: z.string().min(2),
  start: z.string().date(),
  end: z.string().date(),
  exclusive: z.boolean(),
})

const holdInput = z.object({
  requestNo: z.string().optional(),
  workId: z.string().min(2),
  work: z.string().min(2),
  channel: z.string().min(2),
  territory: z.string().min(2),
  start: z.string().date(),
  end: z.string().date(),
  owner: z.string().min(2),
  releaseDays: z.number().int().min(0),
  operatorTerritory: z.string().min(2),
})

// 准入账服务端账本：与客户端共用 lib/ledger 引擎，请求号幂等、跨地区拒绝
let ledger: HoldRequest[] = initialHolds

export const appRouter = t.router({
  catalog: t.procedure.query(() => ({ works: ['W-001', 'W-002'], channels: ['星海影院', '云帆视频', '南华卫视', '海岛航空', '环球新媒体'] })),
  windows: t.procedure.query(() => initialWindows),
  conflicts: t.procedure.query(() => findConflicts(initialWindows)),
  validateWindow: t.procedure.input(windowInput).mutation(({ input }) => {
    if (new Date(input.end) < new Date(input.start)) return { valid: false, message: '窗口结束日期不能早于开始日期。' }
    const collision = initialWindows.find((item) => item.channel === input.channel && input.start <= item.end && item.start <= input.end)
    return collision ? { valid: false, message: `与现有窗口 ${collision.id} 重叠，请调整窗口或明确优先级。` } : { valid: true, message: '窗口结构校验通过。' }
  }),
  comments: t.procedure.query(() => initialComments),
  holds: t.procedure.query(() => ledger),
  submitHold: t.procedure.input(holdInput).mutation(({ input }) => {
    const { operatorTerritory, ...draft } = input
    const result = bookHold(ledger, { ...draft, territory: draft.territory as Territory }, { operatorTerritory: operatorTerritory as Territory, operator: draft.owner })
    ledger = result.holds
    return result
  }),
  retryHold: t.procedure.input(z.object({ requestNo: z.string().min(2), operatorTerritory: z.string().min(2) })).mutation(({ input }) => {
    const result = retryHold(ledger, input.requestNo, { operatorTerritory: input.operatorTerritory as Territory, operator: '接口重试' })
    ledger = result.holds
    return result
  }),
})

export type AppRouter = typeof appRouter
