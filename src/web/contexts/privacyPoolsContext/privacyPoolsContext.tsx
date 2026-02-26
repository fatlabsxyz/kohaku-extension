import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { HDNodeWallet, Mnemonic } from 'ethers'
import { createPublicClient, http } from 'viem'
import { viem } from '@kohaku-eth/provider/viem';

import {
  ERC20AssetId,
  Host,
  Keystore,
} from '@kohaku-eth/plugins'
import { createPPv1Plugin, createPPv1Broadcaster, MAINNET_CONFIG, PPv1Instance, PPv1Broadcaster } from '@kohaku-eth/privacy-pools'
import eventBus from '@web/extension-services/event/eventBus'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useStorageController from '@common/hooks/useStorageController'

function createKeystore(seedPhrase: string): Keystore {
  const mnemonic = Mnemonic.fromPhrase(seedPhrase)
  const masterNode = HDNodeWallet.fromSeed(mnemonic.computeSeed())

  return {
    deriveAt(path: string) {
      const derived = masterNode.derivePath(path)
      return derived.privateKey as `0x${string}`
    }
  }
}

function createProvider(rpcUrl: string) {
  const publicClient = createPublicClient({ transport: http(rpcUrl) })

  return viem(publicClient);
}

export type PPv1Note = Awaited<ReturnType<PPv1Instance['notes']>>[number]
export type PPv1PublicOp = Awaited<ReturnType<PPv1Instance['ragequit']>>

interface PrivacyPoolsContextValue {
  instance: PPv1Instance | null
  broadcaster: PPv1Broadcaster | null
  isReady: boolean
  notes: (assets?: ERC20AssetId[]) => Promise<PPv1Note[]>
  ragequit: (labels: PPv1Note['label'][]) => Promise<PPv1PublicOp>
}

const PrivacyPoolsContext = createContext<PrivacyPoolsContextValue>({
  instance: null,
  broadcaster: null,
  isReady: false,
  notes: async () => [],
  ragequit: async () => { throw new Error('Not ready') }
})

const PrivacyPoolsProtocolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dispatch } = useBackgroundService()
  const keystoreState = useKeystoreControllerState()
  const networksState = useNetworksControllerState()
  const storage = useStorageController()
  const [instance, setInstance] = useState<PPv1Instance | null>(null)
  const [broadcaster, setBroadcaster] = useState<PPv1Broadcaster | null>(null)
  const [isReady, setIsReady] = useState(false)
  const initRef = useRef(false)

  const notes = useCallback(
    async (assets: ERC20AssetId[] = []) => {
      if (!instance) return []
      return instance.notes(assets)
    },
    [instance]
  )

  const ragequit = useCallback(
    async (labels: PPv1Note['label'][]) => {
      if (!instance) throw new Error('Not ready')
      return instance.ragequit(labels)
    },
    [instance]
  )

  const initProtocol = useCallback(
    async (seedPhrase: string) => {
      const networks = (networksState as any).networks || []
      const ethereumNetwork = networks.find(
        (n: any) => n.chainId === BigInt(MAINNET_CONFIG.CHAIN_ID)
      )
      const rpcUrl = ethereumNetwork?.selectedRpcUrl || ethereumNetwork?.rpcUrls?.[0]

      if (!rpcUrl) return

      const params = {
        accountIndex: 0,
        ipfsUrl: 'http://localhost:3001/',
        broadcasterUrl: 'http://localhost:3000/relayer',
        entrypoint: {
          address: BigInt(MAINNET_CONFIG.ENTRYPOINT_ADDRESS),
          deploymentBlock: 22153713n
        }
      }

      const host: Host = {
        network: { fetch: globalThis.fetch.bind(globalThis) },
        storage: { get: storage.getItem, set: storage.setItem } as Host['storage'],
        keystore: createKeystore(seedPhrase),
        provider: createProvider(rpcUrl)
      }

      const inst = createPPv1Plugin(host, params)
      setInstance(inst)
      setBroadcaster(createPPv1Broadcaster(host, params))
      setIsReady(true)
    },
    [networksState, storage]
  )

  useEffect(() => {
    const onReceiveOneTimeData = (data: any) => {
      if (!data.seed || initRef.current) return
      initRef.current = true
      initProtocol(data.seed)
    }

    eventBus.addEventListener('receiveOneTimeData', onReceiveOneTimeData)

    return () => eventBus.removeEventListener('receiveOneTimeData', onReceiveOneTimeData)
  }, [initProtocol])

  useEffect(() => {
    if (initRef.current) return

    const seeds = (keystoreState as any).seeds
    if (!seeds?.length) return

    dispatch({
      type: 'KEYSTORE_CONTROLLER_SEND_SEED_TO_UI',
      params: { id: seeds[0].id }
    })
  }, [keystoreState, dispatch])

  return (
    <PrivacyPoolsContext.Provider value={{ instance, broadcaster, isReady, notes, ragequit }}>
      {children}
    </PrivacyPoolsContext.Provider>
  )
}

function usePrivacyPoolsProtocol() {
  return useContext(PrivacyPoolsContext)
}

export { PrivacyPoolsProtocolProvider, PrivacyPoolsContext, usePrivacyPoolsProtocol }
