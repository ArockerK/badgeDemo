const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
const { parse } = require('csv-parse')
const fs = require('fs')
const path = require('path')
const ethers = require('ethers')


async function parseCSV() {
    return new Promise((resolve, reject) => {
      const sourcePath = path.resolve('./merkle/whitelistv2.csv')
      if (!sourcePath) reject("whitelist csv file not found.")
      const walletAddresses = []
      const times = []
      const leafHashes = []
      let onboardingDate, timestamp;
      console.info("Reading whitelists")
      fs.createReadStream(sourcePath)
        .pipe(parse())
        .on('data', (row) => {
          const [walletAddress, onboardingTime] = row
          //排除文件头
          if (row.includes("address") || row.includes("onboardingTime")) return
          walletAddresses.push(walletAddress)
          /*convert 2022-10-1 to Unix Timestamp*/
          onboardingDate = new Date(onboardingTime);
          //to second
          timestamp = onboardingDate.getTime() / 1000;
          times.push(timestamp);
          //cal hash
          //console.log("walletAddress is ", walletAddress, "onboardingTime is ", onboardingTime.toString(), "timeStamp is ", timestamp)
          leaf = ethers.utils.solidityPack(["address", "uint256"], [walletAddress, timestamp])

          leafHashes.push(leaf)
        })
        .on('end', () => {
          console.log('whitelist file successfully processed');
          resolve([walletAddresses, times, leafHashes])
        });
    })
}

function generateMerkleTree(leaves = []) {
    const leafHashes = leaves.map(x => keccak256(x))
    const tree = new MerkleTree(leafHashes, keccak256, { sort: true })
    return tree;
}

function getProof(tree, leave) {
  const leaf = keccak256(leave);
  const proof = tree.getHexProof(leaf);
  
  return proof;
}

function verify(tree, leaf, proof) {
  const root = tree.getHexRoot();
  const leafHash = keccak256(leaf);
  return tree.verify(proof, leafHash, root);
}

async function main() {
    const [addresses, times, leafhashes] = await parseCSV()
    const tree = generateMerkleTree(leafhashes)

    const root = tree.getHexRoot()

    const proof = getProof(tree, leafhashes[0])

    console.log(verify(tree, leafhashes[0], proof)) // true
    console.log(verify(tree, leafhashes[1], proof))  // false
}

module.exports = {
  getProof,
  generateMerkleTree,
  verify
}



main()
  .then()



