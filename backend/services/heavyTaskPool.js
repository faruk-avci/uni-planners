import { availableParallelism } from 'os'
import { Worker } from 'worker_threads'

const detectedCores = availableParallelism()

class HeavyTaskPool {
  constructor({ poolSize, maxQueue }) {
    this.poolSize = poolSize
    this.maxQueue = maxQueue
    this.queue = []
    this.tasks = new Map()
    this.workers = []
    this.nextId = 1
    this.stopping = false
    for (let index = 0; index < poolSize; index += 1) this.spawn(index)
  }

  spawn(index) {
    const slot = { index, worker: null, taskId: null, restarting: false }
    const worker = new Worker(new URL('../workers/heavyTaskWorker.js', import.meta.url), {
      execArgv: process.execArgv.filter(argument => !argument.startsWith('--input-type')),
    })
    slot.worker = worker
    this.workers[index] = slot

    worker.on('message', message => this.complete(slot, message))
    worker.on('error', error => {
      const task = slot.taskId ? this.tasks.get(slot.taskId) : null
      if (task) this.rejectTask(task, error)
    })
    worker.on('exit', code => {
      const task = slot.taskId ? this.tasks.get(slot.taskId) : null
      if (task) this.rejectTask(task, new Error(`Heavy worker exited with code ${code}`))
      if (!this.stopping && this.workers[index] === slot) this.spawn(index)
    })
    this.dispatch()
  }

  run(type, payload, { priority = 0, timeoutMs = 30_000 } = {}) {
    if (this.queue.length >= this.maxQueue) {
      const error = new Error('Heavy task queue is full')
      error.code = 'HEAVY_QUEUE_FULL'
      return Promise.reject(error)
    }

    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const task = {
        id,
        type,
        payload,
        priority,
        queuedAt: performance.now(),
        resolve,
        reject,
        timeout: null,
      }
      task.timeout = setTimeout(() => this.timeoutTask(task), timeoutMs)
      task.timeout.unref?.()
      this.tasks.set(id, task)
      this.queue.push(id)
      this.queue.sort((a, b) => {
        const left = this.tasks.get(a)
        const right = this.tasks.get(b)
        return (right?.priority || 0) - (left?.priority || 0) || (left?.queuedAt || 0) - (right?.queuedAt || 0)
      })
      this.dispatch()
    })
  }

  dispatch() {
    for (const slot of this.workers) {
      if (!slot || slot.taskId || slot.restarting) continue
      let task = null
      while (this.queue.length > 0 && !task) task = this.tasks.get(this.queue.shift())
      if (!task) return
      task.startedAt = performance.now()
      task.slot = slot
      slot.taskId = task.id
      slot.worker.postMessage({ id: task.id, type: task.type, payload: task.payload })
    }
  }

  complete(slot, message) {
    const task = this.tasks.get(message.id)
    slot.taskId = null
    if (!task) {
      this.dispatch()
      return
    }
    clearTimeout(task.timeout)
    this.tasks.delete(task.id)
    const metrics = {
      workerThreadId: message.threadId,
      queueMs: task.startedAt - task.queuedAt,
      runMs: message.runMs,
    }
    if (message.ok) task.resolve({ result: message.result, metrics })
    else {
      const error = new Error(message.error)
      error.code = 'HEAVY_TASK_FAILED'
      error.metrics = metrics
      task.reject(error)
    }
    this.dispatch()
  }

  rejectTask(task, error) {
    clearTimeout(task.timeout)
    this.tasks.delete(task.id)
    if (task.slot) task.slot.taskId = null
    task.reject(error)
  }

  timeoutTask(task) {
    if (!this.tasks.has(task.id)) return
    const error = new Error('Heavy task timed out')
    error.code = 'HEAVY_TASK_TIMEOUT'
    if (task.slot) task.slot.restarting = true
    this.rejectTask(task, error)
    if (task.slot) task.slot.worker.terminate().catch(() => {})
    this.dispatch()
  }

  stats() {
    return {
      detectedCores,
      workers: this.poolSize,
      busyWorkers: this.workers.filter(slot => slot?.taskId).length,
      queuedTasks: this.queue.filter(id => this.tasks.has(id)).length,
      maxQueue: this.maxQueue,
    }
  }

  async close() {
    this.stopping = true
    await Promise.all(this.workers.map(slot => slot?.worker.terminate()))
  }
}

// Schedule generation (pure JS combinatorics) and PNG rendering (SVG build +
// a native Sharp/libvips encode) have very different resource profiles and
// used to share one small pool. Under a concurrent burst that mix let a
// stream of higher-priority generate tasks starve PNG exports indefinitely
// behind them, since priority ordering always dispatches generate_schedule
// first regardless of queue order -- separate pools mean one workload can
// never block the other out entirely.
function sizeFromEnv(envVar, ceiling) {
  const configured = Number.parseInt(process.env[envVar], 10)
  if (Number.isFinite(configured)) return Math.min(Math.max(configured, 1), 32)
  return Math.min(Math.max(detectedCores - 1, 1), ceiling)
}

function queueFromEnv(envVar, fallback) {
  const configured = Number.parseInt(process.env[envVar], 10)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 10), 5000) : fallback
}

const schedulePoolSize = sizeFromEnv('SCHEDULE_WORKERS', 6)
const schedulePoolQueue = queueFromEnv('SCHEDULE_QUEUE_MAX', 250)
const imagePoolSize = sizeFromEnv('IMAGE_WORKERS', 3)
const imagePoolQueue = queueFromEnv('IMAGE_QUEUE_MAX', 100)

export const schedulePool = new HeavyTaskPool({ poolSize: schedulePoolSize, maxQueue: schedulePoolQueue })
export const imagePool = new HeavyTaskPool({ poolSize: imagePoolSize, maxQueue: imagePoolQueue })

export const heavyTaskPoolConfig = {
  detectedCores,
  schedule: { poolSize: schedulePoolSize, maxQueue: schedulePoolQueue },
  image: { poolSize: imagePoolSize, maxQueue: imagePoolQueue },
}

export async function closeHeavyTaskPools() {
  await Promise.all([schedulePool.close(), imagePool.close()])
}
