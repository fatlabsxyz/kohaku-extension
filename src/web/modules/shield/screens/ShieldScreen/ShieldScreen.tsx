import React, { useCallback, useEffect, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { formatEther, parseEther } from 'ethers'

import { Session } from '@ambire-common/classes/session'
import { SignUserRequest } from '@ambire-common/interfaces/userRequest'
import { AssetAmount, ERC20AssetId } from '@kohaku-eth/plugins'
import { MAINNET_CONFIG, E_ADDRESS } from '@kohaku-eth/privacy-pools'
import FireIcon from '@common/assets/svg/FireIcon'
import BackButton from '@common/components/BackButton'
import Button from '@common/components/Button'
import Input from '@common/components/Input'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  TabLayoutContainer,
  tabLayoutWidths
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import { usePrivacyPoolsProtocol, PPv1Note } from '@web/contexts/privacyPoolsContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import getStyles from './styles'

const NATIVE_ASSET: ERC20AssetId = { __type: 'erc20', contract: E_ADDRESS as `0x${string}` }

const formatBalance = (balances: AssetAmount[]): string => {
  if (!balances.length) return '0'

  const total = balances.reduce((sum, b) => sum + b.amount, 0n)
  return total.toString()
}

const ShieldScreen = () => {
  const { styles, theme } = useTheme(getStyles)
  const { instance, broadcaster, isReady, notes: fetchNotes, ragequit } = usePrivacyPoolsProtocol()
  const { dispatch } = useBackgroundService()
  const { account } = useSelectedAccountControllerState()

  const [approvedBalances, setApprovedBalances] = useState<AssetAmount[]>([])
  const [unapprovedBalances, setUnapprovedBalances] = useState<AssetAmount[]>([])
  const [notesList, setNotesList] = useState<PPv1Note[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [ragequitingLabel, setRagequitingLabel] = useState<PPv1Note['label'] | null>(null)
  const [shieldAmount, setShieldAmount] = useState('')
  const [isShielding, setIsShielding] = useState(false)
  const [shieldError, setShieldError] = useState<string | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const fetchBalances = useCallback(async () => {
    if (!instance || !isReady) return

    try {
      setIsLoading(true)
      const [balances, notes] = await Promise.all([
        instance.balance([NATIVE_ASSET]),
        fetchNotes([NATIVE_ASSET])
      ])
      setApprovedBalances(balances.map((b) => ({ asset: b.asset, amount: b.amount })))
      setUnapprovedBalances(balances.map((b) => ({ asset: b.asset, amount: b.pendingAmount })))
      setNotesList(notes)
    } catch {
      // Balances stay at defaults
    } finally {
      setIsLoading(false)
    }
  }, [instance, isReady, fetchNotes])

  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  const handleRagequit = useCallback(async (note: PPv1Note) => {
    if (!account) return

    setRagequitingLabel(note.label)
    try {
      const op = await ragequit([note.label])
      const userRequest: SignUserRequest = {
        id: Date.now(),
        action: { kind: 'calls' as const, calls: op.txns },
        session: new Session(),
        meta: {
          isSignAction: true,
          accountAddr: account.addr,
          chainId: BigInt(MAINNET_CONFIG.CHAIN_ID)
        }
      }
      dispatch({
        type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST',
        params: { userRequest, actionExecutionType: 'open-action-window' }
      })
    } catch {
      // Silently ignore ragequit errors
    } finally {
      setRagequitingLabel(null)
    }
  }, [account, ragequit, dispatch])

  const handleShield = useCallback(async () => {
    if (!instance || !shieldAmount || !account) return

    setShieldError(null)
    setIsShielding(true)

    try {
      const amount = parseEther(shieldAmount)
      const { txns: calls } = await instance.prepareShield({ asset: NATIVE_ASSET, amount })

      const userRequest: SignUserRequest = {
        id: Date.now(),
        action: { kind: 'calls' as const, calls },
        session: new Session(),
        meta: {
          isSignAction: true,
          accountAddr: account.addr,
          chainId: BigInt(MAINNET_CONFIG.CHAIN_ID)
        }
      }

      dispatch({
        type: 'REQUESTS_CONTROLLER_ADD_USER_REQUEST',
        params: {
          userRequest,
          actionExecutionType: 'open-action-window'
        }
      })
    } catch (err) {
      setShieldError(err instanceof Error ? err.message : 'Failed to prepare shield')
    } finally {
      setIsShielding(false)
    }
  }, [instance, shieldAmount, account, dispatch])

  const handleWithdraw = useCallback(async () => {
    if (!instance || !broadcaster || !withdrawAmount || !withdrawRecipient) return

    setWithdrawError(null)
    setIsWithdrawing(true)

    try {
      const amount = parseEther(withdrawAmount)
      const operation = await instance.prepareUnshield(
        { asset: NATIVE_ASSET, amount },
        withdrawRecipient as `0x${string}`
      )

      await broadcaster.broadcast(operation)

      setWithdrawAmount('')
      setWithdrawRecipient('')
      fetchBalances()
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Failed to withdraw')
    } finally {
      setIsWithdrawing(false)
    }
  }, [instance, broadcaster, withdrawAmount, withdrawRecipient, fetchBalances])

  const showLoading = !isReady || isLoading

  return (
    <TabLayoutContainer
      width="xl"
      footer={<BackButton />}
      footerStyle={{ maxWidth: tabLayoutWidths.xl }}
      header={<Header mode="title" withAmbireLogo />}
    >
      <View style={[flexbox.flex1, spacings.pvSm, spacings.phSm]}>
        <Text fontSize={20} weight="semiBold" style={spacings.mbLg}>
          Shield
        </Text>

        <View style={styles.balanceCard}>
          <Text fontSize={14} style={styles.balanceLabel}>
            Approved balance
          </Text>
          {showLoading ? (
            <SkeletonLoader width={120} height={24} style={spacings.mtTy} />
          ) : (
            <Text fontSize={20} weight="semiBold" style={[styles.balanceValue, spacings.mtTy]}>
              {formatBalance(approvedBalances)}
            </Text>
          )}
        </View>

        <View style={styles.balanceCard}>
          <Text fontSize={14} style={styles.balanceLabel}>
            Unapproved balance
          </Text>
          {showLoading ? (
            <SkeletonLoader width={120} height={24} style={spacings.mtTy} />
          ) : (
            <Text fontSize={20} weight="semiBold" style={[styles.balanceValue, spacings.mtTy]}>
              {formatBalance(unapprovedBalances)}
            </Text>
          )}
        </View>

        <View style={[styles.balanceCard, spacings.mtSm]}>
          <Text fontSize={14} weight="medium" style={spacings.mbSm}>
            Notes
          </Text>
          {showLoading ? (
            <SkeletonLoader width="100%" height={40} style={spacings.mtTy} />
          ) : notesList.length === 0 ? (
            <Text fontSize={13} style={styles.balanceLabel}>
              No notes found
            </Text>
          ) : (
            notesList.map((note, index) => (
              <View
                key={index}
                style={[
                  flexbox.directionRow,
                  flexbox.alignCenter,
                  flexbox.justifySpaceBetween,
                  index < notesList.length - 1 && spacings.mbTy
                ]}
              >
                <Text fontSize={13} style={styles.balanceLabel}>
                  Note {index + 1}
                </Text>
                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                  <Text fontSize={13} weight="medium" style={spacings.mrSm}>
                    {formatEther(note.balance)} ETH
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRagequit(note)}
                    disabled={ragequitingLabel === note.label}
                  >
                    <FireIcon
                      width={20}
                      height={20}
                      opacity={ragequitingLabel === note.label ? 0.4 : 1}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.balanceCard, spacings.mtSm]}>
          <Text fontSize={14} weight="medium" style={spacings.mbSm}>
            Shield ETH
          </Text>
          <Input
            placeholder="0.0"
            value={shieldAmount}
            onChangeText={setShieldAmount}
            keyboardType="decimal-pad"
            containerStyle={spacings.mbSm}
          />
          {!!shieldError && (
            <Text fontSize={12} color={theme.errorText} style={spacings.mbTy}>
              {shieldError}
            </Text>
          )}
          <Button
            text={isShielding ? 'Shielding...' : 'Shield'}
            onPress={handleShield}
            disabled={!isReady || !shieldAmount || isShielding}
            hasBottomSpacing={false}
          />
        </View>

        <View style={[styles.balanceCard, spacings.mtSm]}>
          <Text fontSize={14} weight="medium" style={spacings.mbSm}>
            Withdraw ETH
          </Text>
          <Input
            placeholder="0x..."
            value={withdrawRecipient}
            onChangeText={setWithdrawRecipient}
            containerStyle={spacings.mbSm}
            label="Recipient address"
          />
          <Input
            placeholder="0.0"
            value={withdrawAmount}
            onChangeText={setWithdrawAmount}
            keyboardType="decimal-pad"
            containerStyle={spacings.mbSm}
            label="Amount"
          />
          {!!withdrawError && (
            <Text fontSize={12} color={theme.errorText} style={spacings.mbTy}>
              {withdrawError}
            </Text>
          )}
          <Button
            text={isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
            onPress={handleWithdraw}
            disabled={!isReady || !withdrawAmount || !withdrawRecipient || isWithdrawing}
            hasBottomSpacing={false}
          />
        </View>
      </View>
    </TabLayoutContainer>
  )
}

export default React.memo(ShieldScreen)
