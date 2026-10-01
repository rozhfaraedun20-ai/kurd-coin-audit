import { ethers } from "ethers";

export function hashLeaf(index: number, address: string, amountWei: string | bigint): string {
  const normalizedAddr = ethers.getAddress(address);
  const weiBigInt = BigInt(amountWei);
  return ethers.solidityPackedKeccak256(
    ['uint256', 'address', 'uint256'],
    [index, normalizedAddr, weiBigInt]
  );
}

export function hashPair(a: string, b: string): string {
  const bufA = ethers.getBytes(a);
  const bufB = ethers.getBytes(b);

  for (let i = 0; i < 32; i++) {
    if (bufA[i] < bufB[i]) {
      return ethers.keccak256(ethers.concat([bufA, bufB]));
    }
    if (bufA[i] > bufB[i]) {
      return ethers.keccak256(ethers.concat([bufB, bufA]));
    }
  }
  return ethers.keccak256(ethers.concat([bufA, bufB]));
}

export function createEntitlementMerkleTree(
  entitlements: { address: string; amountKc: string; amountWei: string }[]
) {
  if (entitlements.length === 0) {
    return { root: ethers.ZeroHash, leaves: [], proofs: {}, manifest: [] };
  }

  const sorted = [...entitlements].sort((a, b) => {
    return ethers.getAddress(a.address).localeCompare(ethers.getAddress(b.address));
  });

  const leaves: string[] = [];
  const leafData: any[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const leaf = hashLeaf(i, item.address, item.amountWei);
    leaves.push(leaf);
    leafData.push({
      index: i,
      address: ethers.getAddress(item.address),
      amountWei: item.amountWei,
      amountKc: item.amountKc,
      leaf
    });
  }

  const layers: string[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const currentLayer = layers[layers.length - 1];
    const nextLayer: string[] = [];

    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        nextLayer.push(hashPair(currentLayer[i], currentLayer[i + 1]));
      } else {
        nextLayer.push(currentLayer[i]);
      }
    }
    layers.push(nextLayer);
  }

  const root = layers[layers.length - 1][0];
  const proofs: Record<string, string[]> = {};
  const manifest: any[] = [];

  for (let i = 0; i < leaves.length; i++) {
    const proof: string[] = [];
    let currentIndex = i;

    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
      const currentLayer = layers[layerIndex];
      const isRightNode = currentIndex % 2 === 1;
      const pairIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (pairIndex < currentLayer.length) {
        proof.push(currentLayer[pairIndex]);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    const addr = leafData[i].address;
    proofs[addr.toLowerCase()] = proof;
    proofs[addr] = proof;

    manifest.push({
      index: leafData[i].index,
      address: addr,
      amountWei: leafData[i].amountWei,
      amountKc: leafData[i].amountKc,
      leaf: leafData[i].leaf,
      proof
    });
  }

  return { root, leaves, proofs, manifest };
}
