import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AccountPoolService } from '../AccountPoolService'
import { ClaudeCredentials } from '../../credentials'
import { Pool } from 'pg'

// Mock the credentials module
vi.mock('../../credentials', () => ({
  loadCredentials: vi.fn(),
  getApiKey: vi.fn(),
}))

// Mock the TokenUsageService
vi.mock('../TokenUsageService', () => ({
  TokenUsageService: vi.fn().mockImplementation(() => ({
    getUsageWindow: vi.fn(),
  })),
}))

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
  },
}))

describe('AccountPoolService', () => {
  let service: AccountPoolService
  let mockPool: Pool
  const credentialsDir = '/test/credentials'

  beforeEach(() => {
    vi.clearAllMocks()
    mockPool = {} as Pool
    service = new AccountPoolService(credentialsDir, mockPool)
  })

  describe('loadPool', () => {
    it('should load a valid pool configuration', async () => {
      const { loadCredentials } = await import('../../credentials')
      const poolCreds: ClaudeCredentials = {
        type: 'pool',
        pool: {
          poolId: 'test-pool',
          accounts: ['acc_1', 'acc_2'],
          strategy: 'sticky',
        },
        client_api_key: 'cnp_test',
      }

      const acc1Creds: ClaudeCredentials = {
        type: 'api_key',
        accountId: 'acc_1',
        api_key: 'sk-ant-1',
      }

      const acc2Creds: ClaudeCredentials = {
        type: 'api_key',
        accountId: 'acc_2',
        api_key: 'sk-ant-2',
      }

      // Mock credentials loading
      vi.mocked(loadCredentials)
        .mockReturnValueOnce(poolCreds)
        .mockReturnValueOnce(acc1Creds)
        .mockReturnValueOnce(acc2Creds)

      // Mock file system to find account files
      const fs = await import('fs')
      vi.mocked(fs.promises.readdir).mockResolvedValue([
        'account-1.credentials.json',
        'account-2.credentials.json',
      ] as any)

      await service.loadPool('/test/pool.credentials.json')

      expect(loadCredentials).toHaveBeenCalledWith('/test/pool.credentials.json')
      expect(loadCredentials).toHaveBeenCalledTimes(3) // pool + 2 accounts
    })

    it('should throw error for invalid pool credentials', async () => {
      const { loadCredentials } = await import('../../credentials')
      vi.mocked(loadCredentials).mockReturnValue(null)

      await expect(service.loadPool('/test/pool.credentials.json')).rejects.toThrow(
        'Invalid pool credential file'
      )
    })

    it('should throw error for non-pool credentials', async () => {
      const { loadCredentials } = await import('../../credentials')
      const nonPoolCreds: ClaudeCredentials = {
        type: 'api_key',
        accountId: 'acc_1',
        api_key: 'sk-ant-1',
      }
      vi.mocked(loadCredentials).mockReturnValue(nonPoolCreds)

      await expect(service.loadPool('/test/pool.credentials.json')).rejects.toThrow(
        'Invalid pool credential file'
      )
    })
  })

  describe('selectAccount', () => {
    beforeEach(async () => {
      // Set up a pool with two accounts
      const { loadCredentials, getApiKey } = await import('../../credentials')
      const poolCreds: ClaudeCredentials = {
        type: 'pool',
        pool: {
          poolId: 'test-pool',
          accounts: ['acc_1', 'acc_2'],
          strategy: 'sticky',
        },
      }

      const acc1Creds: ClaudeCredentials = {
        type: 'api_key',
        accountId: 'acc_1',
        api_key: 'sk-ant-1',
      }

      const acc2Creds: ClaudeCredentials = {
        type: 'api_key',
        accountId: 'acc_2',
        api_key: 'sk-ant-2',
      }

      vi.mocked(loadCredentials)
        .mockReturnValueOnce(poolCreds)
        .mockReturnValueOnce(acc1Creds)
        .mockReturnValueOnce(acc2Creds)
        .mockReturnValue(poolCreds) // For getPoolConfig calls

      vi.mocked(getApiKey)
        .mockResolvedValueOnce('sk-ant-1')
        .mockResolvedValueOnce('sk-ant-2')

      const fs = await import('fs')
      vi.mocked(fs.promises.readdir).mockResolvedValue([
        'account-1.credentials.json',
        'account-2.credentials.json',
      ] as any)

      await service.loadPool('/test/pool.credentials.json')
    })

    it('should select least used account when no conversation ID', async () => {
      const { getApiKey } = await import('../../credentials')
      vi.mocked(getApiKey).mockResolvedValue('sk-ant-1')

      // Mock token usage - acc_1 has more usage
      const tokenUsageService = (service as any).tokenUsageService
      vi.mocked(tokenUsageService.getUsageWindow)
        .mockResolvedValueOnce({
          totalOutputTokens: 100000, // acc_1 has high usage
        })
        .mockResolvedValueOnce({
          totalOutputTokens: 20000, // acc_2 has low usage
        })

      const result = await service.selectAccount('/test/pool.credentials.json')

      expect(result).toBeDefined()
      expect(result?.accountId).toBe('acc_2') // Should select account with less usage
    })

    it('should use sticky routing for conversations', async () => {
      const { getApiKey } = await import('../../credentials')
      vi.mocked(getApiKey).mockResolvedValue('sk-ant-1')

      // First request for a conversation
      const tokenUsageService = (service as any).tokenUsageService
      vi.mocked(tokenUsageService.getUsageWindow).mockResolvedValue({
        totalOutputTokens: 50000,
      })

      const result1 = await service.selectAccount('/test/pool.credentials.json', 'conv-123')
      expect(result1?.accountId).toBe('acc_1')

      // Second request for same conversation should use same account
      const result2 = await service.selectAccount('/test/pool.credentials.json', 'conv-123')
      expect(result2?.accountId).toBe('acc_1')
    })

    it('should switch accounts when current account hits limits', async () => {
      const { getApiKey } = await import('../../credentials')
      vi.mocked(getApiKey).mockResolvedValue('sk-ant-2')

      // Set up conversation mapping
      const result1 = await service.selectAccount('/test/pool.credentials.json', 'conv-123')

      // Mock that first account is now exhausted
      const tokenUsageService = (service as any).tokenUsageService
      vi.mocked(tokenUsageService.getUsageWindow)
        .mockResolvedValueOnce({
          totalOutputTokens: 139500, // Near limit
        })
        .mockResolvedValueOnce({
          totalOutputTokens: 20000, // acc_2 has capacity
        })

      const result2 = await service.selectAccount('/test/pool.credentials.json', 'conv-123')
      expect(result2?.accountId).toBe('acc_2') // Should switch to account with capacity
    })
  })

  describe('getPoolStatus', () => {
    it('should return pool status with account usage', async () => {
      // Set up a pool
      const { loadCredentials, getApiKey } = await import('../../credentials')
      const poolCreds: ClaudeCredentials = {
        type: 'pool',
        pool: {
          poolId: 'test-pool',
          accounts: ['acc_1', 'acc_2'],
        },
      }

      vi.mocked(loadCredentials).mockReturnValue(poolCreds)
      vi.mocked(getApiKey).mockResolvedValue('sk-ant-1')

      const tokenUsageService = (service as any).tokenUsageService
      vi.mocked(tokenUsageService.getUsageWindow)
        .mockResolvedValueOnce({
          totalOutputTokens: 50000,
        })
        .mockResolvedValueOnce({
          totalOutputTokens: 30000,
        })

      const status = await service.getPoolStatus('/test/pool.credentials.json')

      expect(status).toBeDefined()
      expect(status?.poolId).toBe('test-pool')
      expect(status?.totalCapacity).toBe(280000) // 2 accounts * 140k tokens
      expect(status?.totalUsed).toBe(80000) // 50k + 30k
      expect(status?.accounts).toHaveLength(2)
    })
  })
})