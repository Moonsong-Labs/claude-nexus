import { Queue } from 'bullmq'
import 'dotenv/config'

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
}

export const analysisQueue = new Queue('analysis-queue', { connection })

export async function enqueueAnalysis(conversationId: string) {
  await analysisQueue.add('analyze-conversation', { conversationId })
  console.log(`Enqueued analysis for conversation ${conversationId}`)
}
