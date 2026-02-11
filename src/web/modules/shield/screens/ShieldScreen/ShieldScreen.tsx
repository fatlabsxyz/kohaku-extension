import React, { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { parseEther } from 'ethers'

import { Session } from '@ambire-common/classes/session'
import { SignUserRequest } from '@ambire-common/interfaces/userRequest'
import { AssetAmount, Eip155ChainId, Erc20Id } from '@kohaku-eth/plugins'
import { MAINNET_CONFIG, E_ADDRESS } from '@kohaku-eth/privacy-pools'
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
import { usePrivacyPoolsProtocol } from '@web/contexts/privacyPoolsContext'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import getStyles from './styles'

const MAINNET_CHAIN_ID = new Eip155ChainId(MAINNET_CONFIG.CHAIN_ID)
const NATIVE_ASSET = new Erc20Id(E_ADDRESS as `0x${string}`, MAINNET_CHAIN_ID)

const formatBalance = (balances: AssetAmount[]): string => {
  if (!balances.length) return '0'

  const total = balances.reduce((sum, b) => sum + b.amount, 0n)
  return total.toString()
}

const ShieldScreen = () => {
  const { styles, theme } = useTheme(getStyles)
  const { protocol, isReady } = usePrivacyPoolsProtocol()
  const { dispatch } = useBackgroundService()
  const { account } = useSelectedAccountControllerState()

  const [approvedBalances, setApprovedBalances] = useState<AssetAmount[]>([])
  const [unapprovedBalances, setUnapprovedBalances] = useState<AssetAmount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [shieldAmount, setShieldAmount] = useState('')
  const [isShielding, setIsShielding] = useState(false)
  const [shieldError, setShieldError] = useState<string | null>(null)

  useEffect(() => {
    if (!protocol || !isReady) return

    let cancelled = false

    const fetchBalances = async () => {
      try {
        setIsLoading(true)
        const [approved, unapproved] = await Promise.all([
          protocol.balance([NATIVE_ASSET], 'approved'),
          protocol.balance([NATIVE_ASSET], 'unapproved')
        ])
        if (cancelled) return
        setApprovedBalances(approved)
        setUnapprovedBalances(unapproved)
      } catch {
        // Balances stay at defaults
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchBalances()

    return () => {
      cancelled = true
    }
  }, [protocol, isReady])

  const handleShield = useCallback(async () => {
    if (!protocol || !shieldAmount || !account) return

    setShieldError(null)
    setIsShielding(true)

    try {
      const amount = parseEther(shieldAmount)
      const preparation = await protocol.prepareShield({ asset: NATIVE_ASSET, amount })

      const calls = preparation.txns.map((tx) => ({
        to: tx.to,
        value: tx.value,
        data: tx.data
      }))

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
  }, [protocol, shieldAmount, account, dispatch])

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
      </View>
    </TabLayoutContainer>
  )
}

export default React.memo(ShieldScreen)
