import { publicStatusPolling } from './api'

const base = { report_id: 'r1', incident_status: null, notice: null } as const

test('public status keeps polling after APPROVED until the arrival notice exists', () => {
  expect(publicStatusPolling({ ...base, status: 'APPROVED' })).toBe(10000)
  const notice = { kind: 'SCHEDULED', text: 'Llega 08:15', arrival: '08:15' } as const
  expect(publicStatusPolling({ ...base, status: 'APPROVED', notice })).toBe(false)
  expect(publicStatusPolling({ ...base, status: 'REJECTED' })).toBe(false)
  expect(publicStatusPolling({ ...base, status: 'QUEUED' })).toBe(2000)
  expect(publicStatusPolling(undefined)).toBe(2000)
})
