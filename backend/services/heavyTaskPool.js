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

const defaultSize = Math.min(Math.max(detectedCores - 1, 1), 4)
const configuredSize = Number.parseInt(process.env.HEAVY_WORKERS, 10)
const poolSize = Number.isFinite(configuredSize) ? Math.min(Math.max(configuredSize, 1), 32) : defaultSize
const configuredQueue = Number.parseInt(process.env.HEAVY_QUEUE_MAX, 10)
const maxQueue = Number.isFinite(configuredQueue) ? Math.min(Math.max(configuredQueue, 10), 5000) : 250

export const schedulePool = new HeavyTaskPool({ poolSize, maxQueue })
export const heavyTaskPoolConfig = { detectedCores, poolSize, maxQueue }

export async function closeHeavyTaskPools() {
  await schedulePool.close()
}
