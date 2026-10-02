'use client'

import { useMemo, useState } from 'react'
import { Box, Flex, Grid, Heading, Text, Badge, Button, Input, Select, Table, Thead, Tbody, Tr, Th, Td, useToast, HStack } from '@chakra-ui/react'
import { useRightsStore } from '@/store/rights'
import { conflictSlicesFor, dayCount, slotKey } from '@/lib/ledger'
import type { BookOutcome } from '@/lib/ledger'
import type { HoldRequest, HoldStatus, Territory } from '@/lib/types'

const territories: Territory[] = ['中国大陆', '中国香港', '中国台湾', '新加坡', '马来西亚', '东南亚区域', '北美']
const channels = ['星海影院', '云帆视频', '南华卫视', '海岛航空', '环球新媒体']

const statusColor: Record<HoldStatus, string> = { 占位中: 'blue', 待重排: 'orange', 已作废: 'gray', 已确认: 'green', 已拒绝: 'red' }
const sourceColor: Record<string, string> = { 临时占档: 'cyan', 正式授权: 'purple', 历史补录: 'gray' }
const outcomeStatus: Record<BookOutcome, 'success' | 'warning' | 'info' | 'error'> = { 占位成功: 'success', 排队待排: 'warning', 重复占位: 'info', 权限拒绝: 'error', 日期无效: 'error', 未找到: 'warning' }

export default function HoldsPage() {
  const windows = useRightsStore((state) => state.windows)
  const holds = useRightsStore((state) => state.holds)
  const requeueLog = useRightsStore((state) => state.requeueLog)
  const operatorTerritory = useRightsStore((state) => state.operatorTerritory)
  const setOperatorTerritory = useRightsStore((state) => state.setOperatorTerritory)
  const submitHold = useRightsStore((state) => state.submitHold)
  const retryHoldByNo = useRightsStore((state) => state.retryHoldByNo)
  const releaseHoldDays = useRightsStore((state) => state.releaseHoldDays)
  const toast = useToast()

  const works = useMemo(() => Array.from(new Map(windows.map((item) => [item.workId, item.work]))).map(([workId, work]) => ({ workId, work })), [windows])
  const [form, setForm] = useState({ workId: 'W-001', territory: '中国大陆' as Territory, channel: '云帆视频', start: '2026-12-21', end: '2027-03-31', releaseDays: 7, owner: '北京发行办 · 章宁', requestNo: '' })
  const [retryNo, setRetryNo] = useState('RQ-2026-1004')

  const slots = useMemo(() => {
    const visible = holds.filter((hold) => hold.status === '占位中' || hold.status === '待重排' || hold.status === '已确认')
    const groups = new Map<string, HoldRequest[]>()
    for (const hold of visible) {
      const key = slotKey(hold)
      groups.set(key, [...(groups.get(key) ?? []), hold])
    }
    return Array.from(groups.values()).map((group) => ({
      key: slotKey(group[0]!),
      head: group[0]!,
      active: group.filter((hold) => hold.status !== '待重排').sort((a, b) => a.seq - b.seq),
      queued: group.filter((hold) => hold.status === '待重排').sort((a, b) => a.seq - b.seq),
    }))
  }, [holds])

  const ledger = useMemo(() => [...holds].sort((a, b) => b.seq - a.seq), [holds])
  const cards = [
    { label: '占位中', value: holds.filter((hold) => hold.status === '占位中').length, note: '临时占档有效占用' },
    { label: '待重排', value: holds.filter((hold) => hold.status === '待重排').length, note: '同档期排队或等待重排' },
    { label: '已作废 / 已拒绝', value: holds.filter((hold) => hold.status === '已作废' || hold.status === '已拒绝').length, note: '条款变化作废与权限拒绝' },
    { label: '历史依据', value: holds.filter((hold) => hold.status === '已确认').length, note: `含历史补录 ${holds.filter((hold) => hold.source === '历史补录').length} 条 · 正式授权不重排` },
  ]

  function notify(outcome: BookOutcome, message: string) {
    toast({ title: outcome, description: message, status: outcomeStatus[outcome], duration: 6000, isClosable: true })
  }

  function onSubmit() {
    const work = works.find((item) => item.workId === form.workId)
    const result = submitHold({ requestNo: form.requestNo || undefined, workId: form.workId, work: work?.work ?? form.workId, channel: form.channel, territory: form.territory, start: form.start, end: form.end, owner: form.owner, releaseDays: form.releaseDays })
    notify(result.outcome, result.message)
    if (result.outcome === '占位成功' || result.outcome === '排队待排') setForm((current) => ({ ...current, requestNo: '' }))
  }

  function onRetry(requestNo: string) {
    if (!requestNo.trim()) return toast({ title: '请输入请求号', status: 'warning' })
    const result = retryHoldByNo(requestNo.trim())
    notify(result.outcome, result.message)
  }

  function onRelease(requestNo: string) {
    const result = releaseHoldDays(requestNo, 7)
    if (!result.released) return toast({ title: '无可释放天数', status: 'warning' })
    toast({ title: `已释放 ${result.released} 天`, description: result.promoted.length ? `排队请求 ${result.promoted.join('、')} 已按到达顺序补位。` : '同档期暂无排队请求补位。', status: 'success', duration: 6000, isClosable: true })
  }

  return (
    <Box>
      <Flex justify="space-between" mb={5} gap={4} direction={{ base: 'column', md: 'row' }}>
        <Box><Text color="brand.600" fontSize="xs" fontWeight="bold">SLOT ADMISSION LEDGER</Text><Heading fontSize="3xl" my={1}>临时占档准入账</Heading><Text color="gray.600">请求按作品 × 地区 × 渠道落账，同档期按请求到达顺序占位；窗口或条款意见变化时受影响的占档立即作废重排，已确认的正式授权不动。</Text></Box>
        <HStack align="flex-end"><Box><Text fontSize="xs" color="gray.500" mb={1}>当前操作地区（跨地区处理将被拒绝）</Text><Select minW="180px" bg="white" value={operatorTerritory} onChange={(event) => setOperatorTerritory(event.target.value as Territory)}>{territories.map((territory) => <option key={territory}>{territory}</option>)}</Select></Box></HStack>
      </Flex>

      <Grid templateColumns={{ base: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' }} gap={4} mb={5}>
        {cards.map((card) => <Box key={card.label} bg="white" border="1px solid" borderColor="gray.200" borderLeft="4px solid" borderLeftColor="brand.500" borderRadius="8px" p={4}><Text color="gray.500" fontSize="sm">{card.label}</Text><Heading size="lg" my={1}>{card.value}</Heading><Text color="gray.500" fontSize="xs">{card.note}</Text></Box>)}
      </Grid>

      <Grid templateColumns={{ base: '1fr', xl: 'minmax(340px,.7fr) minmax(0,1.3fr)' }} gap={4} mb={4}>
        <Box>
          <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5} mb={4}>
            <Heading size="md" mb={1}>递交占档请求</Heading><Text color="gray.500" fontSize="sm" mb={4}>同一档期双方同时递交时，按请求到达顺序占位</Text>
            <Grid templateColumns="1fr 1fr" gap={3}>
              <Box gridColumn="span 2"><Text fontSize="sm" mb={1}>作品</Text><Select value={form.workId} onChange={(event) => setForm({ ...form, workId: event.target.value })}>{works.map((work) => <option key={work.workId} value={work.workId}>{work.work} · {work.workId}</option>)}</Select></Box>
              <Box><Text fontSize="sm" mb={1}>地区</Text><Select value={form.territory} onChange={(event) => setForm({ ...form, territory: event.target.value as Territory })}>{territories.map((territory) => <option key={territory}>{territory}</option>)}</Select></Box>
              <Box><Text fontSize="sm" mb={1}>渠道</Text><Select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>{channels.map((channel) => <option key={channel}>{channel}</option>)}</Select></Box>
              <Box><Text fontSize="sm" mb={1}>开始日期</Text><Input type="date" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></Box>
              <Box><Text fontSize="sm" mb={1}>结束日期</Text><Input type="date" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></Box>
              <Box><Text fontSize="sm" mb={1}>可释放天数</Text><Input type="number" value={form.releaseDays} onChange={(event) => setForm({ ...form, releaseDays: Number(event.target.value) })} /></Box>
              <Box><Text fontSize="sm" mb={1}>请求号（留空自动分配）</Text><Input placeholder="RQ-2026-…" value={form.requestNo} onChange={(event) => setForm({ ...form, requestNo: event.target.value })} /></Box>
              <Box gridColumn="span 2"><Text fontSize="sm" mb={1}>提交人</Text><Input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} /></Box>
            </Grid>
            <Button w="100%" mt={4} colorScheme="blue" onClick={onSubmit}>递交占档</Button>
          </Box>
          <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
            <Heading size="md" mb={1}>按请求号重试</Heading><Text color="gray.500" fontSize="sm" mb={3}>失败后凭请求号重试，已有有效占位时不重复落账</Text>
            <HStack><Input placeholder="RQ-2026-1004" value={retryNo} onChange={(event) => setRetryNo(event.target.value)} /><Button colorScheme="blue" variant="outline" onClick={() => onRetry(retryNo)}>重试</Button></HStack>
          </Box>
        </Box>

        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
          <Flex justify="space-between" align="center" mb={4}><Box><Heading size="md">档期占位看板</Heading><Text color="gray.500" fontSize="sm">排队方可看到被占日期与占用方的可释放天数</Text></Box><Badge colorScheme="blue">{slots.length} 个档期</Badge></Flex>
          {slots.map((slot) => (
            <Box key={slot.key} border="1px solid" borderColor="gray.200" borderRadius="8px" mb={4} overflow="hidden">
              <Flex bg="gray.50" px={4} py={2} justify="space-between" align="center"><Text fontWeight="700" fontSize="sm">{slot.head.work} · {slot.head.territory} · {slot.head.channel}</Text><Text fontSize="xs" color="gray.500">{slot.key}</Text></Flex>
              <Box p={4}>
                {slot.active.map((hold) => (
                  <Flex key={hold.id} justify="space-between" align="center" gap={3} py={2} borderBottom="1px dashed" borderColor="gray.100">
                    <Box><HStack mb={1}><Badge colorScheme={statusColor[hold.status]}>{hold.status}</Badge><Badge colorScheme={sourceColor[hold.source]} variant="outline">{hold.source}</Badge><Text fontWeight="600" fontSize="sm">{hold.requestNo}</Text></HStack><Text fontSize="sm" color="gray.600">{hold.start} → {hold.end} · {hold.owner}</Text>{hold.note && <Text fontSize="xs" color="gray.400">{hold.note}</Text>}</Box>
                    <HStack flexShrink={0}><Badge colorScheme={hold.releaseDays > 0 ? 'teal' : 'gray'} variant="subtle">可释放 {hold.releaseDays} 天</Badge>{hold.status === '占位中' && hold.releaseDays > 0 && <Button size="xs" colorScheme="teal" variant="outline" onClick={() => onRelease(hold.requestNo)}>释放 7 天</Button>}</HStack>
                  </Flex>
                ))}
                {slot.queued.map((hold) => (
                  <Box key={hold.id} mt={3} p={3} bg="orange.50" borderLeft="3px solid" borderLeftColor="orange.400" borderRadius="6px">
                    <Flex justify="space-between" align="center"><HStack><Badge colorScheme="orange">待重排</Badge><Text fontWeight="600" fontSize="sm">{hold.requestNo}</Text><Text fontSize="xs" color="gray.500">到达 #{hold.seq} · {hold.owner}</Text></HStack><Text fontSize="sm" color="gray.600">{hold.start} → {hold.end}</Text></Flex>
                    {conflictSlicesFor(holds, hold).map((slice) => (
                      <Flex key={slice.requestNo} justify="space-between" mt={2} fontSize="sm"><Text color="red.600">冲突日 {slice.start} ~ {slice.end}（{slice.days} 天）</Text><Text color="gray.600">占用 {slice.requestNo} · {slice.source} · 可释放 {slice.releaseDays} 天</Text></Flex>
                    ))}
                  </Box>
                ))}
                {!slot.queued.length && !slot.active.length && <Text color="gray.400" fontSize="sm">暂无有效占位</Text>}
              </Box>
            </Box>
          ))}
        </Box>
      </Grid>

      <Grid templateColumns={{ base: '1fr', xl: 'minmax(0,1.3fr) minmax(320px,.7fr)' }} gap={4}>
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" overflow="hidden">
          <Flex p={4} justify="space-between" align="center"><Box><Heading size="md">准入账明细</Heading><Text color="gray.500" fontSize="sm">含作废与拒绝记录，占档来源可追溯</Text></Box><Badge>{ledger.length} 条</Badge></Flex>
          <Box overflowX="auto">
            <Table size="sm">
              <Thead><Tr><Th>请求号</Th><Th>来源</Th><Th>作品 / 地区 / 渠道</Th><Th>占档日期</Th><Th>到达顺序</Th><Th>状态</Th><Th>说明</Th><Th>操作</Th></Tr></Thead>
              <Tbody>
                {ledger.map((hold) => (
                  <Tr key={hold.id}>
                    <Td><Text fontWeight="600">{hold.requestNo}</Text>{hold.note && <Text fontSize="xs" color="gray.400">{hold.note}</Text>}</Td>
                    <Td><Badge colorScheme={sourceColor[hold.source]} variant="outline">{hold.source}</Badge></Td>
                    <Td><Text fontWeight="600">{hold.work}</Text><Text color="gray.500" fontSize="xs">{hold.territory} · {hold.channel}</Text></Td>
                    <Td whiteSpace="nowrap">{hold.start} → {hold.end}<Text color="gray.400" fontSize="xs">{dayCount(hold.start, hold.end)} 天</Text></Td>
                    <Td whiteSpace="nowrap">#{hold.seq}<Text color="gray.400" fontSize="xs">{hold.arrivedAt.slice(5, 16).replace('T', ' ')}</Text></Td>
                    <Td><Badge colorScheme={statusColor[hold.status]}>{hold.status}</Badge></Td>
                    <Td maxW="260px"><Text fontSize="xs" color="gray.600">{hold.voidReason ?? (hold.blockedBy.length ? `等待 ${hold.blockedBy.join('、')} 释放或到期` : hold.events[hold.events.length - 1]?.detail ?? '')}</Text></Td>
                    <Td>{(hold.status === '已拒绝' || hold.status === '已作废') ? <Button size="xs" variant="outline" colorScheme="blue" onClick={() => onRetry(hold.requestNo)}>按请求号重试</Button> : hold.status === '占位中' && hold.releaseDays > 0 ? <Button size="xs" variant="outline" colorScheme="teal" onClick={() => onRelease(hold.requestNo)}>释放 7 天</Button> : null}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Box>

        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5} alignSelf="start">
          <Heading size="md" mb={1}>重排结果</Heading><Text color="gray.500" fontSize="sm" mb={4}>窗口或条款意见变化触发的作废与重排记录</Text>
          {!requeueLog.length && <Box p={4} bg="gray.50" borderRadius="8px"><Text fontSize="sm" color="gray.500">暂无重排记录。到「授权窗口」调整窗口日期，或在「审阅与版本」合并条款意见，受影响档位的临时占档会立即作废重排。</Text></Box>}
          {[...requeueLog].reverse().map((record) => (
            <Box key={record.id} p={3} mb={3} bg={record.outcome === '占位中' ? 'green.50' : record.outcome === '待重排' ? 'orange.50' : 'red.50'} borderLeft="3px solid" borderLeftColor={record.outcome === '占位中' ? 'green.400' : record.outcome === '待重排' ? 'orange.400' : 'red.400'} borderRadius="6px">
              <Flex justify="space-between" align="center"><Text fontWeight="700" fontSize="sm">{record.requestNo}</Text><Badge colorScheme={record.outcome === '占位中' ? 'green' : record.outcome === '待重排' ? 'orange' : 'red'}>{record.outcome === '占位中' ? '重排占位' : record.outcome === '待重排' ? '重排排队' : record.outcome}</Badge></Flex>
              <Text fontSize="xs" color="gray.600" mt={1}>{record.reason}</Text>
              <Text fontSize="xs" color="gray.400" mt={1}>{record.voidedId} 作废{record.newId ? ` → ${record.newId} 重新落账` : ''} · {record.time.slice(5, 16).replace('T', ' ')}</Text>
            </Box>
          ))}
        </Box>
      </Grid>
    </Box>
  )
}
