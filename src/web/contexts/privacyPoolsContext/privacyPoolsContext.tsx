import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { HDNodeWallet, Mnemonic } from 'ethers'
import { createPublicClient, http } from 'viem'

import {
  EthProvider,
  Host,
  Keystore,
  Storage as PluginStorage,
  SecretStorage as PluginSecretStorage,
} from '@kohaku-eth/plugins'
import { PrivacyPoolsV1Protocol, MAINNET_CONFIG, AspService, SecretManager } from '@kohaku-eth/privacy-pools'
import eventBus from '@web/extension-services/event/eventBus'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useStorageControllerState from '@web/hooks/useStorageControllerState'
import useStorageController from '@common/hooks/useStorageController'

const STORAGE_PREFIX = 'pp_v1_'
const SECRET_STORAGE_PREFIX = 'pp_v1_secret_'

function createStorage(): PluginStorage {
  return {
    _brand: 'Storage',
    set(key: string, value: string) {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, value)
    },
    get(key: string) {
      return localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    }
  }
}

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

interface PrivacyPoolsContextValue {
  protocol: PrivacyPoolsV1Protocol | null
  isReady: boolean
}

const PrivacyPoolsContext = createContext<PrivacyPoolsContextValue>({
  protocol: null,
  isReady: false
})

const PrivacyPoolsProtocolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dispatch } = useBackgroundService()
  const keystoreState = useKeystoreControllerState()
  const networksState = useNetworksControllerState()
  const storage = useStorageController();
  const [protocol, setProtocol] = useState<PrivacyPoolsV1Protocol | null>(null)
  const [isReady, setIsReady] = useState(false)
  const initRef = useRef(false)

  const initProtocol = useCallback(
    (seedPhrase: string) => {
      const networks = (networksState as any).networks || []
      const ethereumNetwork = networks.find(
        (n: any) => n.chainId === BigInt(MAINNET_CONFIG.CHAIN_ID)
      )
      const rpcUrl = ethereumNetwork?.selectedRpcUrl || ethereumNetwork?.rpcUrls?.[0]

      if (!rpcUrl) return

      const host: Host = {
        network: { fetch: globalThis.fetch.bind(globalThis) },
        storage: { get: storage.getItem, set: storage.setItem },
        secretStorage: createSecretStorage(),
        keystore: createKeystore(seedPhrase),
        ethProvider: createEthProvider(rpcUrl)
      }

      const instance = new PrivacyPoolsV1Protocol(host, {
        secretManager: () => {
          const sm = SecretManager({host, accountIndex: 1});
          const derive = (di: number, wi: number) => sm.getSecrets({ entrypointAddress: BigInt(MAINNET_CONFIG.ENTRYPOINT_ADDRESS), chainId: 1n, depositIndex: di, withdrawIndex: wi});
          console.log(derive);
          return sm;
        },
        chainsEntrypoints: {
          [`eip155:${MAINNET_CONFIG.CHAIN_ID}`]: {
            address: BigInt(MAINNET_CONFIG.ENTRYPOINT_ADDRESS),
            deploymentBlock: 22153713n
          }
        },
        relayersList: {
          [`eip155:${MAINNET_CONFIG.CHAIN_ID}`]: 'http://localhost:3000/relayer'
        },
        aspServiceFactory: () => new AspService({network: host.network, aspUrl: 'http://localhost:3001/'})
      })

      setProtocol(instance)
      setIsReady(true)
    },
    [networksState, storage, setProtocol, setIsReady, storage]
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
    <PrivacyPoolsContext.Provider value={{ protocol, isReady }}>
      {children}
    </PrivacyPoolsContext.Provider>
  )
}

function usePrivacyPoolsProtocol() {
  return useContext(PrivacyPoolsContext)
}

export { PrivacyPoolsProtocolProvider, PrivacyPoolsContext, usePrivacyPoolsProtocol }
