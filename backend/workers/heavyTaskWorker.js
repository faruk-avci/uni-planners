import { parentPort, threadId } from 'worker_threads'
import { generateSchedules } from '../scheduleEngine.js'

parentPort.on('message', async message => {
  const { id, type, payload } = message
  const startedAt = performance.now()

  try {
    let result

    if (type === 'generate_schedule') {
      result = generateSchedules(payload.coursesSections, {
        ...payload.options,
        freeDayIdxs: new Set(payload.options.freeDayIndexes || []),
      })
    } else {
      throw new Error(`Unknown heavy task: ${type}`)
    }

    parentPort.postMessage({
      id,
      ok: true,
      result,
      threadId,
      runMs: performance.now() - startedAt,
    })
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: error?.message || 'Worker task failed',
      threadId,
      runMs: performance.now() - startedAt,
    })
  }
})
