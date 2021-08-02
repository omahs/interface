import { BigNumber } from 'ethers'
import JSBI from 'jsbi'
import { useMemo } from 'react'
import { LogsState, useLogs } from '../../state/logs/hooks'
import compareLogs from '../../utils/compareLogs'
import { useV3Staker } from '../useContract'

const VALID_STATES: LogsState[] = [LogsState.SYNCING, LogsState.SYNCED]

export enum DepositedTokenIdsState {
  INVALID,
  LOADING,
  LOADED,
}

export interface DepositedTokenIdsResult {
  state: DepositedTokenIdsState
  tokenIds: JSBI[] | undefined
}

export function useDepositedTokenIds(account: string | undefined | null): DepositedTokenIdsResult {
  const v3Staker = useV3Staker()
  const filters = useMemo(() => {
    if (!v3Staker || !account) return []
    return [
      v3Staker.filters.DepositTransferred(undefined, account, undefined),
      v3Staker.filters.DepositTransferred(undefined, undefined, account),
    ]
  }, [account, v3Staker])

  const transferredFromLogs = useLogs(filters[0])
  const transferredToLogs = useLogs(filters[1])

  const orderedDepositEvents = useMemo(() => {
    if (!VALID_STATES.includes(transferredFromLogs.state) || !VALID_STATES.includes(transferredToLogs.state))
      return undefined

    return (transferredFromLogs.logs ?? []).concat(transferredToLogs.logs ?? []).sort(compareLogs)
  }, [transferredFromLogs.logs, transferredFromLogs.state, transferredToLogs])

  return useMemo(() => {
    if (!v3Staker || !account)
      return {
        state: DepositedTokenIdsState.INVALID,
        tokenIds: undefined,
      }

    if (!orderedDepositEvents)
      return {
        state: DepositedTokenIdsState.LOADING,
        tokenIds: undefined,
      }

    const ownedTokenIdMap = orderedDepositEvents.reduce<{ [tokenId: string]: boolean }>((memo, log) => {
      const parsed = v3Staker.interface.decodeEventLog('DepositTransferred', log.data, log.topics)
      memo[parsed.tokenId.toString()] = parsed.newOwner === account
      return memo
    }, {})

    const tokenIds = Object.entries(ownedTokenIdMap)
      .filter(([, owned]) => owned)
      .map(([tokenId]) => tokenId)
      .map(JSBI.BigInt)
    return {
      state: DepositedTokenIdsState.LOADED,
      tokenIds,
    }
  }, [account, orderedDepositEvents, v3Staker])
}

// check if position is deposited into staker contract
export function useIsPositionDeposited(account: string | undefined | null, tokenId: BigNumber | undefined): boolean {
  const { state, tokenIds } = useDepositedTokenIds(account)

  if (!account || !tokenId) {
    return false
  }

  return Boolean(
    state === DepositedTokenIdsState.LOADED &&
      tokenIds &&
      tokenIds.find((id) => BigNumber.from(id.toString()).eq(tokenId))
  )
}