import { ChainId, chainName } from '@sushiswap/chain'
import { Prisma, PrismaClient } from '@sushiswap/database'
import { performance } from 'perf_hooks'

import { getBuiltGraphSDK, V2PairsQuery } from '../../../../.graphclient/index.js'
import { PoolType, ProtocolName, ProtocolVersion } from '../../../config.js'
import { createPools, getLatestPoolTimestamp } from '../../../etl/pool/load.js'
import { createTokens } from '../../../etl/token/load.js'
import { GRAPH_HOST, UNISWAP_V2_SUBGRAPH_NAME, UNISWAP_V2_SUPPORTED_CHAINS } from '../config.js'

const PROTOCOL = ProtocolName.UNISWAP
const VERSION = ProtocolVersion.V2
const CONSTANT_PRODUCT_POOL = PoolType.CONSTANT_PRODUCT_POOL
const SWAP_FEE = 0.003
const TWAP_ENABLED = true

export async function uniswapV2() {
  const client = new PrismaClient()
  try {
    const startTime = performance.now()
    console.log(`Preparing to load pools/tokens, protocol: ${PROTOCOL}`)

    await start(client)

    const endTime = performance.now()
    console.log(`COMPLETE - Script ran for ${((endTime - startTime) / 1000).toFixed(1)} seconds. `)
  } catch (e) {
    console.error(e)
    await client.$disconnect()
  } finally {
    await client.$disconnect()
  }
}

async function start(client: PrismaClient) {
  console.log(
    `Fetching pools from ${PROTOCOL} ${VERSION}, chains: ${UNISWAP_V2_SUPPORTED_CHAINS.map(
      (chainId) => chainName[chainId]
    ).join(', ')}`
  )

  let totalPairCount = 0
  for (const chainId of UNISWAP_V2_SUPPORTED_CHAINS) {
    // Continue from the latest pool creation timestamp,
    // if null, then it's the first time seeding and we grab everything
    const latestPoolTimestamp = await getLatestPoolTimestamp(client, chainId, PROTOCOL, [VERSION])

    const sdk = getBuiltGraphSDK({ chainId, host: GRAPH_HOST[chainId], name: UNISWAP_V2_SUBGRAPH_NAME[chainId] })
    if (!UNISWAP_V2_SUBGRAPH_NAME[chainId]) {
      console.log(`Subgraph not found: ${chainId} ${UNISWAP_V2_SUBGRAPH_NAME[chainId]}, Skipping`)
      continue
    }
    console.log(`Loading data from chain: ${chainName[chainId]}(${chainId}), ${UNISWAP_V2_SUBGRAPH_NAME[chainId]}`)
    let pairCount = 0
    let cursor = ''

    do {
      const startTime = performance.now()
      let where = {}
      if (latestPoolTimestamp) {
        where =
          cursor !== ''
            ? { id_gt: cursor, createdAtTimestamp_gt: latestPoolTimestamp }
            : { createdAtTimestamp_gt: latestPoolTimestamp }
      } else {
        where = cursor !== '' ? { id_gt: cursor } : {}
      }
      const request = await sdk
        .V2Pairs({
          first: 1000,
          where,
        })
        .catch((e: string) => {
          console.log({ e })
          return undefined
        })
        .catch(() => undefined)
      const currentResultCount = request?.V2_pairs.length ?? 0
      const endTime = performance.now()

      pairCount += currentResultCount
      console.log(
        `EXTRACT - extracted ${currentResultCount} pools, total: ${pairCount}, cursor: ${cursor} (${(
          (endTime - startTime) /
          1000
        ).toFixed(1)}s) `
      )

      if (request) {
        const { tokens, pools } = transform(chainId, request)
        // NOTE: This shouldn't have to be async, but was seeing this error:
        // (unlocked closed connection) (CallerID: planetscale-admin)'
        // this script doesn't have to be super fast, so keeping it async to not throttle the db
        await Promise.all([createTokens(client, tokens), createPools(client, pools)])
      }

      const newCursor = request?.V2_pairs[request.V2_pairs.length - 1]?.id ?? ''
      cursor = newCursor
    } while (cursor !== '')
    totalPairCount += pairCount
    console.log(
      `Finished loading pairs from ${GRAPH_HOST[chainId]}/${UNISWAP_V2_SUBGRAPH_NAME[chainId]}, ${pairCount} pairs`
    )
  }
  console.log(`Finished loading pairs for ${PROTOCOL} from all subgraphs, ${totalPairCount} pairs`)
}

