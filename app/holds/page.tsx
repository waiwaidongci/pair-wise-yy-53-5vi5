'use client'

import { useMemo, useState } from 'react'
import {
  Box, Flex, Grid, Heading, Text, Badge, Button, Input, Select, Table, Thead, Tbody, Tr, Th, Td,
  useToast, HStack, Tag, Wrap, WrapItem, Stat, StatLabel, StatNumber, StatHelpText, Divider,
} from '@chakra-ui/react'
import { useRightsStore } from '@/store/rights'
import { holdStats, findConflictDays, nextRequestId } from '@/lib/holds'
import type { HoldStatus, Territory } from '@/lib/types'

const territories: Territory[] = ['中国大陆', '中国香港', '中国台湾', '新加坡', '马来西亚', '东南亚区域', '北美']
const works = [
  { id: 'W-001', name: '《远山回声》' },
  { id: 'W-002', name: '《深港口岸》' },
]

const statusColor: Record<HoldStatus, string> = {
  占档中: 'blue',
  已作废: 'gray',
  已释放: 'cyan',
  已转正: 'green',
  申请失败: 'red',
}

// 档期视图范围
const STRIP_START = '2026-10-01'
const STRIP_END = '2027-12-31'
function stripDays(): string[] {
  const days: string[] = []
  let cur = STRIP_START
  while (cur <= STRIP_END) {
    days.push(cur)
    const d = new Date(`${cur}T00:00:00`)
    d.setDate(d.getDate() + 1)
    cur = d.toISOString().slice(0, 10)
  }
  return days
}

export default function HoldsPage() {
  const holds = useRightsStore((state) => state.holds)
  const windows = useRightsStore((state) => state.windows)
  const operatorRegion = useRightsStore((state) => state.operatorRegion)
  const setOperatorRegion = useRightsStore((state) => state.setOperatorRegion)
  const submitHold = useRightsStore((state) => state.submitHold)
  const retryHold = useRightsStore((state) => state.retryHold)
  const releaseHold = useRightsStore((state) => state.releaseHold)
  const voidHold = useRightsStore((state) => state.voidHold)
  const rearrangeForWindow = useRightsStore((state) => state.rearrangeForWindow)
  const rearrangementLogs = useRightsStore((state) => state.rearrangementLogs)
  const toast = useToast()

  // 表单
  const [workId, setWorkId] = useState('W-001')
  const [territory, setTerritory] = useState<Territory>('中国大陆')
  const [channel, setChannel] = useState('星海影院')
  const [start, setStart] = useState('2026-11-01')
  const [end, setEnd] = useState('2026-11-30')

  // 档期视图
  const [viewWork, setViewWork] = useState('W-001')
  const [viewTerritory, setViewTerritory] = useState<Territory>('中国大陆')

  // 台账筛选
  const [filterWork, setFilterWork] = useState('全部作品')
  const [filterStatus, setFilterStatus] = useState('全部状态')

  const stats = useMemo(() => holdStats(holds), [holds])
  const conflicts = useMemo(() => findConflictDays(holds), [holds])

  const viewDays = useMemo(() => stripDays(), [])
  // 选中档期的占用地图
  const slotMap = useMemo(() => {
    const map = new Map<string, { holdIds: string[]; legacy: boolean }>()
    for (const h of holds) {
      if (h.workId !== viewWork || h.territory !== viewTerritory) continue
      if (h.status !== '占档中' && h.status !== '已转正') continue
      for (const d of h.grantedDays) {
        const cur = map.get(d)
        if (cur) cur.holdIds.push(h.id)
        else map.set(d, { holdIds: [h.id], legacy: !!h.legacy })
      }
    }
    return map
  }, [holds, viewWork, viewTerritory])

  const viewOccupied = viewDays.filter((d) => slotMap.has(d)).length
  const viewConflictDays = viewDays.filter((d) => (slotMap.get(d)?.holdIds.length ?? 0) > 1)
  const viewReleasable = viewDays.length - viewOccupied

  const filtered = useMemo(() => holds.filter((h) => {
    if (filterWork !== '全部作品' && h.workId !== filterWork) return false
    if (filterStatus !== '全部状态' && h.status !== filterStatus) return false
    return true
  }), [holds, filterWork, filterStatus])

  const legacyHolds = holds.filter((h) => h.legacy)

  function handleSubmit() {
    if (new Date(end) < new Date(start)) return toast({ title: '档期无效', description: '结束日期不能早于开始日期。', status: 'error' })
    const id = nextRequestId(holds.length + 1)
    const created = submitHold({
      id, workId, work: works.find((w) => w.id === workId)?.name ?? workId,
      territory, channel, start, end, sourceType: '手工', sourceLabel: '手工占档', operator: '我',
    })
    if (created.status === '申请失败') {
      toast({ title: '占档申请失败', description: created.voidReason ?? '无可用日期，可按请求号重试。', status: 'error' })
    } else {
      toast({ title: '占档已落账', description: `${created.id}：被占 ${created.occupiedDays} 天，可释放 ${created.releasableDays} 天。`, status: 'success' })
    }
  }

  function handleRetry(id: string) {
    retryHold(id)
    const target = useRightsStore.getState().holds.find((h) => h.id === id)
    toast({ title: '已按请求号重试', description: `${id}：${target?.status ?? '已处理'}`, status: target?.status === '申请失败' ? 'warning' : 'success' })
  }

  return (
    <Box>
      <Flex justify="space-between" mb={5} gap={4} direction={{ base: 'column', md: 'row' }}>
        <Box>
          <Text color="brand.600" fontSize="xs" fontWeight="bold">ADMISSION LEDGER</Text>
          <Heading fontSize="3xl" my={1}>临时占档准入账</Heading>
          <Text color="gray.600">请求按作品、地区、渠道落账；同档期按请求到达顺序占位，窗口或意见变化即作废重排，正式授权不受影响。</Text>
        </Box>
        <HStack>
          <Text fontSize="sm" color="gray.500">当前操作地区</Text>
          <Select size="sm" w="150px" value={operatorRegion} onChange={(e) => setOperatorRegion(e.target.value as Territory)}>
            {territories.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </HStack>
      </Flex>

      {/* 统计卡 */}
      <Grid templateColumns={{ base: 'repeat(2,1fr)', lg: 'repeat(6,1fr)' }} gap={3} mb={5}>
        <Stat bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={3}><StatLabel fontSize="xs">占档中</StatLabel><StatNumber fontSize="xl">{stats.active}</StatNumber><StatHelpText mb={0}>临时占位</StatHelpText></Stat>
        <Stat bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={3}><StatLabel fontSize="xs">已转正</StatLabel><StatNumber fontSize="xl">{stats.confirmed}</StatNumber><StatHelpText mb={0}>正式授权</StatHelpText></Stat>
        <Stat bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={3}><StatLabel fontSize="xs">已作废</StatLabel><StatNumber fontSize="xl">{stats.voided}</StatNumber><StatHelpText mb={0}>重排释放</StatHelpText></Stat>
        <Stat bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={3}><StatLabel fontSize="xs">已释放</StatLabel><StatNumber fontSize="xl">{stats.released}</StatNumber><StatHelpText mb={0}>档期归还</StatHelpText></Stat>
        <Stat bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={3}><StatLabel fontSize="xs">申请失败</StatLabel><StatNumber fontSize="xl" color="red.500">{stats.failed}</StatNumber><StatHelpText mb={0}>可按请求号重试</StatHelpText></Stat>
        <Stat bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={3}><StatLabel fontSize="xs">冲突日</StatLabel><StatNumber fontSize="xl" color="orange.500">{conflicts.length}</StatNumber><StatHelpText mb={0}>一槽多占</StatHelpText></Stat>
      </Grid>

      <Grid templateColumns={{ base: '1fr', xl: 'minmax(0,1.15fr) minmax(360px,.85fr)' }} gap={4} mb={4}>
        {/* 落账表单 */}
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
          <Heading size="md" mb={1}>递交临时占档</Heading>
          <Text color="gray.500" fontSize="sm" mb={4}>同档期按请求到达顺序占位，先到先得；跨地区递交将被权限拒绝。</Text>
          <Grid templateColumns="1fr 1fr" gap={4}>
            <Box><Text fontSize="sm" mb={1}>作品</Text><Select value={workId} onChange={(e) => setWorkId(e.target.value)}>{works.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Box>
            <Box><Text fontSize="sm" mb={1}>地区</Text><Select value={territory} onChange={(e) => setTerritory(e.target.value as Territory)}>{territories.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Box>
            <Box><Text fontSize="sm" mb={1}>渠道</Text><Input value={channel} onChange={(e) => setChannel(e.target.value)} /></Box>
            <Box><Text fontSize="sm" mb={1}>申请号（自动）</Text><Input value={nextRequestId(holds.length + 1)} isReadOnly bg="gray.50" /></Box>
            <Box><Text fontSize="sm" mb={1}>开始日期</Text><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Box>
            <Box><Text fontSize="sm" mb={1}>结束日期</Text><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Box>
          </Grid>
          {territory !== operatorRegion && (
            <Text color="red.500" fontSize="sm" mt={3}>权限提示：操作人授权地区为 {operatorRegion}，递交 {territory} 将被拒绝。</Text>
          )}
          <Button w="100%" mt={4} colorScheme="blue" onClick={handleSubmit}>递交占档申请</Button>
        </Box>

        {/* 档期占用视图 */}
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
          <Heading size="md" mb={1}>档期占用视图</Heading>
          <Text color="gray.500" fontSize="sm" mb={3}>后来者可见被占日期与可释放天数。</Text>
          <HStack mb={3}>
            <Select size="sm" value={viewWork} onChange={(e) => setViewWork(e.target.value)}>{works.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
            <Select size="sm" value={viewTerritory} onChange={(e) => setViewTerritory(e.target.value as Territory)}>{territories.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </HStack>
          <HStack mb={2} fontSize="xs" color="gray.600" spacing={4}>
            <HStack><Box w="10px" h="10px" bg="blue.400" borderRadius="2px" /><Text>被占 {viewOccupied} 天</Text></HStack>
            <HStack><Box w="10px" h="10px" bg="red.500" borderRadius="2px" /><Text>冲突 {viewConflictDays.length} 天</Text></HStack>
            <HStack><Box w="10px" h="10px" bg="gray.100" border="1px solid" borderColor="gray.200" borderRadius="2px" /><Text>可释放 {viewReleasable} 天</Text></HStack>
          </HStack>
          <Box overflowX="auto" pb={2}>
            <Box display="flex" gap="1px" minW="max-content">
              {viewDays.map((d) => {
                const info = slotMap.get(d)
                const isConflict = (info?.holdIds.length ?? 0) > 1
                const bg = isConflict ? 'red.500' : info ? (info.legacy ? 'purple.300' : 'blue.400') : 'gray.100'
                return <Box key={d} w="7px" h="22px" bg={bg} borderRadius="1px" title={`${d}${isConflict ? ' 冲突' : info ? ` 占档 ${info.holdIds.join(',')}` : ' 可释放'}`} />
              })}
            </Box>
          </Box>
          <Text color="gray.400" fontSize="xs" mt={1}>{STRIP_START} → {STRIP_END}</Text>
          <Divider my={3} />
          <Heading size="sm" mb={2}>该档期有效占档</Heading>
          {holds.filter((h) => h.workId === viewWork && h.territory === viewTerritory && (h.status === '占档中' || h.status === '已转正')).length === 0 && (
            <Text color="gray.400" fontSize="sm">暂无占档，全部日期可释放。</Text>
          )}
          {holds.filter((h) => h.workId === viewWork && h.territory === viewTerritory && (h.status === '占档中' || h.status === '已转正')).map((h) => (
            <Flex key={h.id} justify="space-between" fontSize="sm" py={1} borderBottom="1px solid" borderColor="gray.50">
              <Text>{h.channel} · <Text as="span" color="gray.500" fontSize="xs">{h.id}</Text>{h.legacy && <Badge ml={1} size="xs" colorScheme="purple">历史</Badge>}</Text>
              <Text color="gray.600">{h.grantedStart ?? h.start} → {h.grantedEnd ?? h.end}</Text>
            </Flex>
          ))}
        </Box>
      </Grid>

      {/* 台账 */}
      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" overflow="hidden" mb={4}>
        <Flex p={4} justify="space-between" align="center" wrap="wrap" gap={2}>
          <Box><Heading size="md">准入账台账</Heading><Text color="gray.500" fontSize="sm">按请求到达顺序占位，标注占档来源与冲突日。</Text></Box>
          <HStack>
            <Select size="sm" w="140px" value={filterWork} onChange={(e) => setFilterWork(e.target.value)}><option value="全部作品">全部作品</option>{works.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
            <Select size="sm" w="130px" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="全部状态">全部状态</option>{Object.keys(statusColor).map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          </HStack>
        </Flex>
        <Box overflowX="auto">
          <Table size="sm">
            <Thead><Tr><Th>请求号</Th><Th>作品 / 渠道</Th><Th>地区</Th><Th>档期</Th><Th>状态</Th><Th>到达</Th><Th>占档来源</Th><Th isNumeric>被占/可释放</Th><Th>冲突日</Th><Th>操作</Th></Tr></Thead>
            <Tbody>
              {filtered.map((h) => (
                <Tr key={h.id} bg={h.status === '申请失败' ? 'red.50' : h.legacy ? 'purple.50' : undefined}>
                  <Td><Text fontWeight="600" fontSize="xs">{h.id}</Text>{h.retryOf && <Badge size="xs" colorScheme="orange">重试</Badge>}</Td>
                  <Td><Text fontWeight="600">{h.work}</Text><Text color="gray.500" fontSize="xs">{h.channel}</Text></Td>
                  <Td>{h.territory}</Td>
                  <Td fontSize="xs">{h.start} → {h.end}</Td>
                  <Td><Badge colorScheme={statusColor[h.status]}>{h.status}</Badge></Td>
                  <Td>{h.arrival}</Td>
                  <Td fontSize="xs">{h.sourceLabel}{h.legacy && <Badge ml={1} size="xs" colorScheme="purple">补录</Badge>}</Td>
                  <Td isNumeric fontSize="xs">{h.occupiedDays} / {h.releasableDays}</Td>
                  <Td fontSize="xs">{h.conflictDays.length ? <Badge colorScheme="red">{h.conflictDays.length} 天</Badge> : <Text color="gray.400">—</Text>}</Td>
                  <Td>
                    <HStack spacing={1}>
                      {h.status === '申请失败' && <Button size="xs" colorScheme="orange" variant="outline" onClick={() => handleRetry(h.id)}>重试</Button>}
                      {h.status === '占档中' && <Button size="xs" variant="ghost" onClick={() => releaseHold(h.id)}>释放</Button>}
                      {h.status === '占档中' && <Button size="xs" variant="ghost" colorScheme="red" onClick={() => voidHold(h.id, '人工作废')}>作废</Button>}
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      </Box>

      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={4} mb={4}>
        {/* 重排结果 */}
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
          <Heading size="md" mb={1}>重排结果</Heading>
          <Text color="gray.500" fontSize="sm" mb={3}>窗口或意见变化后，受影响占档立即作废重排；正式授权不受影响。</Text>
          <HStack mb={3}>
            <Select size="sm" w="200px" id="rr-win" defaultValue={windows[0]?.id}>
              {windows.map((w) => <option key={w.id} value={w.id}>{w.id} · {w.channel}</option>)}
            </Select>
            <Button size="sm" onClick={() => {
              const sel = (document.getElementById('rr-win') as HTMLSelectElement)?.value
              if (sel) { rearrangeForWindow(sel); toast({ title: '已触发重排', description: `窗口 ${sel} 变化，受影响占档已作废重排。`, status: 'info' }) }
            }}>模拟窗口变化触发重排</Button>
          </HStack>
          {rearrangementLogs.length === 0 && <Text color="gray.400" fontSize="sm">暂无重排记录。</Text>}
          {rearrangementLogs.map((log) => (
            <Box key={log.id} p={3} mb={2} bg="orange.50" borderLeft="3px solid" borderLeftColor="orange.400" borderRadius="6px">
              <Flex justify="space-between" align="center"><Text fontWeight="700" fontSize="sm">{log.trigger}</Text><Badge colorScheme="orange">{log.triggerType}</Badge></Flex>
              <Text fontSize="sm" color="gray.700" mt={1}>{log.summary}</Text>
              {(log.voided.length > 0 || log.created.length > 0) && (
                <Wrap mt={2} spacing={1}>
                  {log.voided.map((id) => <WrapItem key={id}><Tag size="sm" colorScheme="gray" variant="subtle">作废 {id}</Tag></WrapItem>)}
                  {log.created.map((id) => <WrapItem key={id}><Tag size="sm" colorScheme="blue" variant="subtle">重排 {id}</Tag></WrapItem>)}
                </Wrap>
              )}
            </Box>
          ))}
        </Box>

        {/* 历史依据 */}
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
          <Heading size="md" mb={1}>历史依据补录</Heading>
          <Text color="gray.500" fontSize="sm" mb={3}>旧数据没有请求号，按确认日期补成历史依据（已转正，不参与重排）。</Text>
          {legacyHolds.length === 0 && <Text color="gray.400" fontSize="sm">暂无历史补录数据。</Text>}
          {legacyHolds.map((h) => (
            <Box key={h.id} p={3} mb={2} bg="purple.50" borderLeft="3px solid" borderLeftColor="purple.400" borderRadius="6px">
              <Flex justify="space-between" align="center">
                <Text fontWeight="700" fontSize="sm">{h.work} · {h.channel}</Text>
                <Badge colorScheme="purple">已转正</Badge>
              </Flex>
              <Text fontSize="sm" color="gray.600" mt={1}>{h.territory} · {h.start} → {h.end}</Text>
              <Text fontSize="xs" color="gray.500" mt={1}>请求号 {h.id} · 确认日期 {h.basisDate} · 来源 {h.sourceId}</Text>
            </Box>
          ))}
        </Box>
      </Grid>
    </Box>
  )
}
