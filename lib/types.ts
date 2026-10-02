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

export type HoldStatus = '占位中' | '待重排' | '已作废' | '已确认' | '已拒绝'
export type HoldSource = '临时占档' | '正式授权' | '历史补录'

export interface HoldEvent {
  time: string
  actor: string
  action: string
  detail: string
}

export interface HoldRequest {
  id: string
  requestNo: string
  workId: string
  work: string
  channel: string
  territory: Territory
  start: string
  end: string
  arrivedAt: string
  seq: number
  status: HoldStatus
  source: HoldSource
  owner: string
  releaseDays: number
  blockedBy: string[]
  voidReason?: string
  confirmedAt?: string
  note?: string
  events: HoldEvent[]
}

export interface RequeueRecord {
  id: string
  requestNo: string
  reason: string
  voidedId: string
  newId?: string
  outcome: HoldStatus
  time: string
}
