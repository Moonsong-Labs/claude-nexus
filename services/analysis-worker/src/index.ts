import { Worker } from 'bullmq'
import 'dotenv/config'

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
}

const worker = new Worker(
  'analysis-queue',
  async job => {
    console.log(`Processing job ${job.id}`)
    // TODO: Implement the actual analysis logic here
    await new Promise(resolve => setTimeout(resolve, 5000)) // Simulate work
    console.log(`Completed job ${job.id}`)
  },
  { connection }
)

console.log('Analysis worker started.')

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error ${err.message}`)
})
