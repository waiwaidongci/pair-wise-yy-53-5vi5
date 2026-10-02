export type RightsType = '院线' | '电视' | '流媒体' | '航空' | '非院线'
export type Territory = '中国大陆' | '中国香港' | '中国台湾' | '新加坡' | '马来西亚' | '东南亚区域' | '北美'

export interface LicenseWindow {
  id: string
  workId: string
  work: string
  channel: string
  rights: RightsType
  territory: Territory
  start: string
  end: string
  exclusive: boolean
  sublicense: boolean
  priority: number
  status: '草案' | '冲突' | '已确认'
  confirmedAt?: string      // 确认日期（旧数据补历史依据用）
  requestNo?: string        // 关联请求号（旧数据可能缺失）
}

export interface RightsComment {
  id: string
  channel: string
  anchor: string
  author: string
  role: string
  content: string
  resolved: boolean
}

export interface DraftVersion {
  id: string
  author: string
  time: string
  summary: string
  changes: string[]
}

// 临时占档准入账
export type HoldStatus = '占档中' | '已作废' | '已释放' | '已转正' | '申请失败'
export type HoldSourceType = '窗口' | '意见' | '手工'

export interface HoldRequest {
  id: string                // 请求号（旧数据可能缺失，用 legacy 标记）
  workId: string
  work: string
  territory: Territory
  channel: string
  start: string             // 申请档期起
  end: string               // 申请档期止
  status: HoldStatus
  arrival: number           // 到达顺序（FIFO 依据）
  arrivedAt: string         // 到达时间 ISO
  sourceType: HoldSourceType
  sourceId?: string         // 关联窗口 / 意见 id
  sourceLabel?: string      // 占档来源说明
  operator: string
  operatorRegion: Territory  // 操作人授权地区（跨地区处理被拒）
  grantedStart?: string     // 实际授予档期起
  grantedEnd?: string       // 实际授予档期止
  grantedDays: string[]     // 实际授予日期清单
  occupiedDays: number      // 被先到占住的天数
  releasableDays: number    // 可释放（可授予）天数
  conflictDays: string[]    // 冲突日期
  voidReason?: string
  retryOf?: string          // 重试所依据的原请求号
  legacy?: boolean          // 旧数据补录
  basisDate?: string        // 历史依据日期（确认日期）
  rearrangedFrom?: string   // 重排来源请求号
}

export interface RearrangementLog {
  id: string
  at: string
  trigger: string           // 触发说明
  triggerType: HoldSourceType
  triggerId: string
  voided: string[]          // 作废请求号
  created: string[]         // 重排生成请求号
  summary: string
}
