import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

// Define your local Polkadot EVM node
export const polkadotLocal = defineChain({
  id: 420420417, // Change this to match your local node's Chain ID if different!
  name: 'Polkadot Hub TestNet',
  network: 'Polkadot Hub TestNet',
  nativeCurrency: {
    decimals: 18,
    name: 'PAS',
    symbol: 'PAS',
  },
  rpcUrls: {
    default: { http: ['https://eth-rpc-testnet.polkadot.io/'] },
  },
});

export const config = getDefaultConfig({
  appName: 'SudoStake',
  projectId: '1aced25d6e55519fdcd655271585bff7', // Can be any string for local dev
  chains: [polkadotLocal],
  ssr: true, 
});