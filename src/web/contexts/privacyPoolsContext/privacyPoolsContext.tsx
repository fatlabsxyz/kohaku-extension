import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { HDNodeWallet, Mnemonic } from 'ethers'
import { createPublicClient, http } from 'viem'

import {
  EthProvider,
  Host,
  Keystore,
  SecretStorage as PluginSecretStorage,
} from '@kohaku-eth/plugins'
import { createPPv1Plugin, MAINNET_CONFIG } from '@kohaku-eth/privacy-pools'
import eventBus from '@web/extension-services/event/eventBus'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useStorageController from '@common/hooks/useStorageController'

const SECRET_STORAGE_PREFIX = 'pp_v1_secret_'

function createSecretStorage(): PluginSecretStorage {
  return {
    _brand: 'SecureStorage',
    set(key: string, value: string) {
      localStorage.setItem(`${SECRET_STORAGE_PREFIX}${key}`, value)
    },
    get(key: string) {
      return localStorage.getItem(`${SECRET_STORAGE_PREFIX}${key}`)
    }
  }
}

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

function createEthProvider(rpcUrl: string): EthProvider {
  const publicClient = createPublicClient({ transport: http(rpcUrl) })

  return {
    request: publicClient.request as never
  }
}

type PPv1Plugin = Awaited<ReturnType<typeof createPPv1Plugin>>
type PPv1Instance = Awaited<ReturnType<PPv1Plugin['createInstance']>>
type PPv1PrivateOp = Awaited<ReturnType<PPv1Instance['prepareUnshield']>>
type PPv1Broadcaster = { broadcast: (op: PPv1PrivateOp) => Promise<void> }

interface PrivacyPoolsContextValue {
  instance: PPv1Instance | null
  broadcaster: PPv1Broadcaster | null
  isReady: boolean
}

const PrivacyPoolsContext = createContext<PrivacyPoolsContextValue>({
  instance: null,
  broadcaster: null,
  isReady: false
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

  const initProtocol = useCallback(
    async (seedPhrase: string) => {
      const networks = (networksState as any).networks || []
      const ethereumNetwork = networks.find(
        (n: any) => n.chainId === BigInt(MAINNET_CONFIG.CHAIN_ID)
      )
      const rpcUrl = ethereumNetwork?.selectedRpcUrl || ethereumNetwork?.rpcUrls?.[0]

      if (!rpcUrl) return

      const host: Host = {
        network: { fetch: globalThis.fetch.bind(globalThis) },
        storage: { get: storage.getItem, set: storage.setItem } as Host['storage'],
        secretStorage: createSecretStorage(),
        keystore: createKeystore(seedPhrase),
        ethProvider: createEthProvider(rpcUrl)
      }

      const pp = await createPPv1Plugin(host, {
        ipfsUrl: 'http://localhost:3001/',
        broadcasterUrl: 'http://localhost:3000/relayer',
        entrypoint: {
          address: BigInt(MAINNET_CONFIG.ENTRYPOINT_ADDRESS),
          deploymentBlock: 22153713n
        }
      })

      const inst = await pp.createInstance()
      setInstance(inst)
      setBroadcaster((pp as unknown as { broadcaster: PPv1Broadcaster }).broadcaster)
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
    <PrivacyPoolsContext.Provider value={{ instance, broadcaster, isReady }}>
      {children}
    </PrivacyPoolsContext.Provider>
  )
}

function usePrivacyPoolsProtocol() {
  return useContext(PrivacyPoolsContext)
}

export { PrivacyPoolsProtocolProvider, PrivacyPoolsContext, usePrivacyPoolsProtocol }
