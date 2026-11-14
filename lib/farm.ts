// A protocol's farm plan: six concrete steps, each with what it costs and how long it takes.
//
// The plan is derived from the protocol's own record — its category, its chains, its TVL and its
// age — never from a hand-written list of names. Two things make it concrete instead of a slogan:
//
//   * The mechanism follows the category. A lending protocol is farmed by supplying and borrowing,
//     a DEX by swapping and adding liquidity, a perps venue by posting margin and opening a
//     position, a vault by depositing into it. The verb changes because the qualifying activity
//     changes; a plan that told every protocol "deposit USDC and hold" would be wrong for half
//     the board.
//   * The cost follows the chain. A transaction on Ethereum costs about $4 of gas, on Base or
//     Arbitrum about $0.25-0.30, on Solana about $0.01. The plan prices its steps on the
//     protocol's first listed chain, so the reader knows the real outlay before starting, and
//     the capital follows the protocol's size: $50 for a small protocol, $250 for one over $5B
//     of TVL, because a dust position in a giant protocol is not a qualifying position.
//
// Nothing here promises an airdrop. Farming is speculative: the plan says what to do and what it
// costs, and the dashboard says plainly that a protocol records no token, never that it has none,
// and never that a token is coming.

import type { SnapshotProtocol } from './model.ts';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Approximate gas for one simple transaction on a chain, in US dollars. */
export function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 4.0;
  if (c === 'arbitrum' || c === 'optimism' || c === 'linea' || c === 'scroll' || c === 'avalanche') return 0.3;
  if (c === 'base' || c === 'zksync era' || c === 'zksync' || c === 'blast') return 0.25;
  if (c === 'mode' || c === 'mantle' || c === 'fantom' || c === 'cronos') return 0.1;
  if (c === 'bsc' || c === 'bnb chain') return 0.15;
  if (c === 'polygon' || c === 'gnosis') return 0.05;
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near') return 0.01;
  return 0.5;
}

/** The first chain a protocol names, or a neutral phrase. */
export function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The mechanism: what a farmer actually does on this kind of protocol. */
export function mechanismFor(p: SnapshotProtocol): { verb: string; action: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return { verb: 'supply and borrow', action: `Supply USDC to ${name} and borrow a small amount against it, then repay the borrow` };
  }
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) {
    return { verb: 'swap and add liquidity', action: `Swap a small amount on ${name} and add liquidity to its main pool` };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('futures') || c.includes('options')) {
    return { verb: 'post margin and trade', action: `Deposit USDC as margin on ${name} and open one small hedged position` };
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('vault') || c.includes('leveraged farm')) {
    return { verb: 'deposit into a vault', action: `Deposit USDC into a ${name} vault and keep the vault shares` };
  }
  if (c.includes('restak') || c.includes('liquid staking') || c.includes('staking')) {
    return { verb: 'stake and restake', action: `Stake the chain's staking asset through ${name} and keep the receipt token` };
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return { verb: 'bridge and use', action: `Bridge USDC through ${name} and use the bridged funds in its app` };
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return { verb: 'mint the yield asset', action: `Mint the protocol's yield-bearing asset on ${name} and hold it` };
  }
  if (c.includes('prediction')) {
    return { verb: 'fund and place a position', action: `Fund an account on ${name} and place one market position` };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) {
    return { verb: 'deposit into a vault', action: `Deposit USDC into a ${name} vault and keep the shares` };
  }
  if (c.includes('stable')) {
    return { verb: 'mint or deposit the stable asset', action: `Mint or deposit the stable asset through ${name}` };
  }
  if (c.includes('insurance')) {
    return { verb: 'buy cover', action: `Buy cover from ${name} and keep the policy active` };
  }
  if (c.includes('launchpad')) {
    return { verb: 'stake and join', action: `Stake on ${name} and join one launch with a small allocation` };
  }
  if (c.includes('privacy')) {
    return { verb: 'shielded deposit', action: `Make one shielded deposit through ${name} and withdraw it later` };
  }
  if (c.includes('nft')) {
    return { verb: 'list and trade', action: `List one item and make one purchase on ${name}'s marketplace` };
  }
  return { verb: 'deposit and hold', action: `Deposit USDC into ${name} and keep the position open` };
}

/** Format a dollar amount the way the plan prints it: $4, $0.25, $0.01. */
export function usd(n: number): string {
  if (n >= 1) return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasUsd(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const mech = mechanismFor(p);
  const setupGas = usd(Math.max(gas * 2, 0.02));
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about ${usd(gas)} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: `${mech.action} on ${chain} with $${capital} of capital.`,
      cost: `$${capital} of capital and about ${setupGas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Repeat the ${mech.verb} activity once a week, so the position stays active across snapshots.`,
      cost: `about ${usd(gas)} of gas a week on ${chain}`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}
