import type { DraftVersion, HoldRequest, LicenseWindow, RightsComment } from './types'
import { backfillLegacy } from './ledger'

export const initialWindows: LicenseWindow[] = [
  { id: 'RW-101', workId: 'W-001', work: '《远山回声》', channel: '星海影院', rights: '院线', territory: '中国大陆', start: '2026-10-18', end: '2026-12-05', exclusive: true, sublicense: false, priority: 1, status: '冲突' },
  { id: 'RW-102', workId: 'W-001', work: '《远山回声》', channel: '云帆视频', rights: '流媒体', territory: '中国大陆', start: '2026-11-20', end: '2027-11-19', exclusive: true, sublicense: false, priority: 2, status: '冲突' },
  { id: 'RW-103', workId: 'W-001', work: '《远山回声》', channel: '南华卫视', rights: '电视', territory: '中国大陆', start: '2027-01-08', end: '2027-03-31', exclusive: false, sublicense: true, priority: 4, status: '草案' },
  { id: 'RW-104', workId: 'W-002', work: '《深港口岸》', channel: '云帆视频', rights: '流媒体', territory: '新加坡', start: '2026-12-01', end: '2027-05-31', exclusive: true, sublicense: false, priority: 1, status: '已确认' },
  { id: 'RW-105', workId: 'W-002', work: '《深港口岸》', channel: '海岛航空', rights: '航空', territory: '东南亚区域', start: '2027-01-15', end: '2027-07-14', exclusive: false, sublicense: true, priority: 3, status: '草案' },
]

export const initialComments: RightsComment[] = [
  { id: 'CM-31', channel: '星海影院', anchor: 'RW-101 · 院线独占尾部', author: '黎清', role: '法务', content: '流媒体开窗早于院线独占结束 15 天，违反窗口倒挂约束。请至少顺延至 2026-12-06。', resolved: false },
  { id: 'CM-32', channel: '云帆视频', anchor: 'RW-102 · 地区范围', author: '章宁', role: '发行', content: '中国大陆独占与港澳台授权不冲突，但宣传物料的地区标识必须拆分为两个物料包。', resolved: false },
  { id: 'CM-33', channel: '南华卫视', anchor: 'RW-103 · 次级授权', author: '黎清', role: '法务', content: '允许转授权，但须禁止向短视频平台分发超过 3 分钟的连续片段。', resolved: true },
]

export const versions: DraftVersion[] = [
  { id: 'v18', author: '章宁', time: '今天 16:35', summary: '调整《远山回声》流媒体窗口并增加港台地区', changes: ['RW-102 开窗日期由 11-15 调整为 11-20', '新增流媒体中国香港、中国台湾窗口', '独占范围拆分与宣传物料条件'] },
  { id: 'v17', author: '黎清', time: '今天 14:08', summary: '补充院线优先权和次级授权限制', changes: ['院线窗口优先级提升为 1', '电视窗口禁止提前点映', '转授权增加地区与时长限制'] },
]

const arrived = (time: string) => `2026-10-02T${time}:00`

export const rawHolds: HoldRequest[] = [
  { id: 'HD-001', requestNo: 'RQ-2026-1001', workId: 'W-001', work: '《远山回声》', channel: '云帆视频', territory: '中国大陆', start: '2026-11-20', end: '2026-12-20', arrivedAt: arrived('09:30:12'), seq: 1, status: '占位中', source: '临时占档', owner: '北京发行办 · 章宁', releaseDays: 21, blockedBy: [], events: [{ time: arrived('09:30:12'), actor: '章宁', action: '递交占位', detail: '同档期无有效占位，按到达顺序直接占位' }] },
  { id: 'HD-002', requestNo: 'RQ-2026-1002', workId: 'W-001', work: '《远山回声》', channel: '云帆视频', territory: '中国大陆', start: '2026-12-15', end: '2027-02-28', arrivedAt: arrived('09:30:47'), seq: 2, status: '待重排', source: '临时占档', owner: '深圳发行办 · 柯岚', releaseDays: 14, blockedBy: ['RQ-2026-1001'], events: [{ time: arrived('09:30:47'), actor: '柯岚', action: '递交排队', detail: '与 RQ-2026-1001 同档期同时递交，到达较晚，按到达顺序排队' }] },
  { id: 'HD-003', requestNo: 'RQ-2026-1003', workId: 'W-002', work: '《深港口岸》', channel: '海岛航空', territory: '东南亚区域', start: '2027-01-15', end: '2027-04-14', arrivedAt: '2026-10-01T15:02:00', seq: 3, status: '占位中', source: '临时占档', owner: '新加坡发行办 · 林澈', releaseDays: 10, blockedBy: [], events: [{ time: '2026-10-01T15:02:00', actor: '林澈', action: '递交占位', detail: '同档期无有效占位，按到达顺序直接占位' }] },
  { id: 'HD-004', requestNo: 'RQ-2026-0990', workId: 'W-002', work: '《深港口岸》', channel: '云帆视频', territory: '新加坡', start: '2026-12-01', end: '2027-05-31', arrivedAt: '2026-09-20T10:00:00', seq: 4, status: '已确认', source: '正式授权', owner: '新加坡发行办 · 林澈', releaseDays: 0, blockedBy: [], confirmedAt: '2026-09-25', events: [{ time: '2026-09-25T10:00:00', actor: '林澈', action: '确认授权', detail: '正式授权已确认，不参与窗口或意见变化的重排' }] },
  { id: 'HD-005', requestNo: '', workId: 'W-001', work: '《远山回声》', channel: '星海影院', territory: '中国大陆', start: '2026-10-18', end: '2026-12-05', arrivedAt: '2026-05-18T00:00:00', seq: 5, status: '已确认', source: '正式授权', owner: '院线发行组 · 郑桁', releaseDays: 0, blockedBy: [], confirmedAt: '2026-05-18', events: [] },
  { id: 'HD-006', requestNo: '', workId: 'W-002', work: '《深港口岸》', channel: '南华卫视', territory: '中国大陆', start: '2026-08-01', end: '2026-10-31', arrivedAt: '2026-05-18T00:00:00', seq: 6, status: '已确认', source: '正式授权', owner: '电视发行组 · 邵一', releaseDays: 0, blockedBy: [], confirmedAt: '2026-05-18', events: [] },
  { id: 'HD-007', requestNo: 'RQ-2026-1004', workId: 'W-002', work: '《深港口岸》', channel: '云帆视频', territory: '北美', start: '2027-01-01', end: '2027-06-30', arrivedAt: '2026-10-01T18:40:00', seq: 7, status: '已拒绝', source: '临时占档', owner: '北京发行办 · 章宁', releaseDays: 7, blockedBy: [], voidReason: '跨地区处理被拒绝：操作地区「中国大陆」无权处理「北美」的占档', events: [{ time: '2026-10-01T18:40:00', actor: '章宁', action: '权限拒绝', detail: '跨地区处理被拒绝：操作地区「中国大陆」无权处理「北美」的占档' }] },
]

export const initialHolds: HoldRequest[] = backfillLegacy(rawHolds)
