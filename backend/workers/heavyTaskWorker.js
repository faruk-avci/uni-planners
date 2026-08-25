import { parentPort, threadId } from 'worker_threads'
import sharp from 'sharp'
import { generateSchedules } from '../scheduleEngine.js'
import { scheduleImageSvg } from '../utils/helpers.js'

// One native image thread per JS worker prevents Sharp from multiplying the
// worker-pool size internally and consuming every CPU core under a PNG burst.
sharp.concurrency(1)

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
    } else if (type === 'render_schedule_png') {
      const svg = scheduleImageSvg(payload.schedule, payload.language, payload.layout)
      const image = await sharp(Buffer.from(svg))
        .withMetadata({ density: 300 })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer()
      result = image
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
