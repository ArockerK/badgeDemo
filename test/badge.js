const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const keccak256 = require('keccak256');

const {
  getProof,
  generateMerkleTree,
  verify
} = require('../merkle/merkle');

describe("badge test", function () {
  let accounts;

  beforeEach(async function () {
    try {
      this.owner = (await ethers.getSigners())[0];
      this.test1 = (await ethers.getSigners())[1];
      this.test2 = (await ethers.getSigners())[2];
      this.test3 = (await ethers.getSigners())[3];
  
      const name = 'test badges';
      const symbol = 'TBS';
  
      this.badgeNft = await ethers.getContractFactory("Badge", this.owner);
      this.badge = await this.badgeNft.deploy(name, symbol);
 
      await this.badge.deployed();

      accounts = [this.owner.address, this.test1.address, this.test2.address];
    } catch (e) {
      console.log(e);
    }
  });


  function getTree() {
    const times = ['2022-1-1', '2021-10-1', '2010-10-10'];
    const timestamps = [new Date(times[0]), new Date(times[1]), new Date(times[2])];

    
    const leaves = [
      ethers.utils.solidityPack(["address", "uint256"], [accounts[0], timestamps[0].getTime() / 1000]),
      ethers.utils.solidityPack(["address", "uint256"], [accounts[1], timestamps[1].getTime() / 1000]),
      ethers.utils.solidityPack(["address", "uint256"], [accounts[2], timestamps[2].getTime() / 1000])
    ];

    const tree = generateMerkleTree(leaves);

    return {timestamps, leaves, tree};
  }

  function getTheProof(index) {

  }
  describe("test merkle.js", function () {
    it("test merkle verify success use merkle.js", async() => {
      //tree
      try {
        const { _, leaves, tree } = getTree();
        const proof0 = getProof(tree, leaves[0]);
        const proof1 = getProof(tree, leaves[1]);
        const proof2 = getProof(tree, leaves[2]);

        const verify0 = verify(tree, leaves[0], proof0);
        const verify1 = verify(tree, leaves[1], proof1);
        const verify2 = verify(tree, leaves[2], proof2);

        const result = verify0  && verify1 && verify2;

        expect(result.toString()).to.equal('true');

      } catch (e) {
        console.log(e);
      }
    });

    it("test merkle verify failed use merkle.js", async() => {
      //tree
      try {
        const { _, leaves, tree } = getTree();
        const proof0 = getProof(tree, leaves[0]);

        const verify0 = verify(tree, leaves[1], proof0);
        
        const result = verify0;

        expect(result.toString()).to.equal('false');

      } catch (e) {
        console.log(e);
      }
    });
  });

  describe("test contract", function () {
    it("Should set the right merkleroot use owner", async function () {
      const { tree } = getTree();
      let setRoot = await this.badge.setMerkleRoot(tree.getRoot());

      let root = await this.badge.merkleRoot();
      expect(root.toString()).to.equal('0x' + tree.getRoot().toString('hex'));
    });

    it("Should not set the merkleroot use other account", async function () {
      const {  tree } = getTree();
      await expect(this.badge.connect(this.test1).setMerkleRoot(tree.getRoot())).to.be.reverted;
    });

    /*
      function mint(
        uint onboardingTime, 
        bytes32[] calldata merkleProof, 
        string memory tokenUrl
      )
      
      event Mint(
        address indexed user, 
        uint256 indexed newTokenId, 
        uint256 level, 
        bool isCurrent
      )
    */
    describe("test mint", function () {
      it("Should mint the badge of current level", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);
        const proof1 = getProof(tree, leaves[1]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;
        const onBoardTime1 = timestamps[1].getTime() / 1000;
        
        await expect(this.badge.mint(onBoardTime0, proof0, 'https://test'))
        .to.emit(this.badge, "Mint")
        .withArgs(this.owner.address, 0, 0, true);

        await expect(this.badge.connect(this.test1).mint(onBoardTime1, proof1, 'https://test'))
        .to.emit(this.badge, "Mint")
        .withArgs(this.test1.address, 1, 1, true);
      });

      it("Should mint the badge of current level (level == 5)", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof2 = getProof(tree, leaves[2]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime2 = timestamps[2].getTime() / 1000;
        
        await expect(this.badge.connect(this.test2).mint(onBoardTime2, proof2, 'https://test'))
        .to.emit(this.badge, "Mint")
        .withArgs(this.test2.address, 0, 5, true);
      });

      it("Should not mint the badge with invalid proof", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof1 = getProof(tree, leaves[1]);
        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;
        
        await expect(this.badge.mint(onBoardTime0, proof1, 'https://test'))
        .to.be.revertedWith("Mint: proof verified fail");
      });

      it("Should not mint the same level badge", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;
        
        await expect(this.badge.mint(onBoardTime0, proof0, 'https://test'))
        .to.emit(this.badge, "Mint")
        .withArgs(this.owner.address, 0, 0, true);

        await expect(this.badge.mint(onBoardTime0, proof0, 'https://test'))
        .to.be.revertedWith("Mint: This level has already minted");
      });

      it("Should not mint when the onBoardTime is too big", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime();
        
        await expect(this.badge.mint(onBoardTime0, proof0, 'https://test'))
        .to.be.revertedWith("Mint: invalid onboarding time");
      });

      it("Should not mint when the uri is null", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;
        
        await expect(this.badge.mint(onBoardTime0, proof0, ''))
        .to.be.revertedWith("Mint: The tokenUrl must not be null");
      });
    });

    /*
      function mintPrevious(
        uint onboardingTime, 
        bytes32[] calldata merkleProof, 
        string memory tokenUrl, 
        uint8 level
      )

      event Mint(
        address indexed user, 
        uint256 indexed newTokenId, 
        uint256 level, 
        bool isCurrent
      )
    */
    describe("test mintPrevious", function () {
      
      it("Should not mint the badge with invalid proof", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof1 = getProof(tree, leaves[1]);
        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;
        
        await expect(this.badge.mintPrevious(onBoardTime0, proof1, 'https://test', 0))
        .to.be.revertedWith("MintPrevious: proof verified fail");
      });

      it("Should not mint when level > 5", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;

        await expect(this.badge.mintPrevious(onBoardTime0, proof0, 'https://test', 6))
        .to.be.revertedWith("MintPrevious: Too large level");
      });

      it("Should not mint when the onBoardTime is too big", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime();
        
        await expect(this.badge.mintPrevious(onBoardTime0, proof0, 'https://test', 0))
        .to.be.revertedWith("MintPrevious: invalid onboarding time");
      });

      it("Should not mint when the uri is null", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;
        
        await expect(this.badge.mintPrevious(onBoardTime0, proof0, '', 0))
        .to.be.revertedWith("MintPrevious: The tokenUrl must not be null");
      });

      it("Should not mint when mintTime is too early ", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof2 = getProof(tree, leaves[2]);

        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime2 = timestamps[2].getTime() / 1000;
        
        await expect(this.badge.connect(this.test2).mintPrevious(onBoardTime2, proof2, 'https://test', 0))
        .to.be.revertedWith("MintPrevious: The mintTime is too early");
        await expect(this.badge.connect(this.test2).mintPrevious(onBoardTime2, proof2, 'https://test', 1))
        .to.be.revertedWith("MintPrevious: The mintTime is too early");
        await expect(this.badge.connect(this.test2).mintPrevious(onBoardTime2, proof2, 'https://test', 2))
        .to.be.revertedWith("MintPrevious: The mintTime is too early");
        await expect(this.badge.connect(this.test2).mintPrevious(onBoardTime2, proof2, 'https://test', 3))
        .to.be.revertedWith("MintPrevious: The mintTime is too early");
        await expect(this.badge.connect(this.test2).mintPrevious(onBoardTime2, proof2, 'https://test', 4))
        .to.be.revertedWith("MintPrevious: The mintTime is too early");
      });


      //需要修改合约代码来适配此测试例
      //临时增加 setStartTime 接口
      /*
      it("Should not mint the same level with ' first mint and then mintPrevious' ", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof0 = getProof(tree, leaves[0]);
        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime0 = timestamps[0].getTime() / 1000;

        await this.badge.setStartTime((new Date('2010-1-1')).getTime() / 1000);        

        await expect(this.badge.mint(onBoardTime0, proof0, 'https://test'))
        .to.emit(this.badge, "Mint")
        .withArgs(this.owner.address, 0, 0, true);
        
        await expect(this.badge.mintPrevious(onBoardTime0, proof0, 'https://test', 0))
        .to.be.revertedWith("MintPrevious: This level has already minted");
      });

      it("Should mint the early level", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof2 = getProof(tree, leaves[2]);
        await this.badge.setMerkleRoot(tree.getHexRoot());

        const onBoardTime2 = timestamps[2].getTime() / 1000;

        await this.badge.setStartTime((new Date('2010-1-1')).getTime() / 1000);
        
        await expect(this.badge.connect(this.test2).mint(onBoardTime2, proof2, 'https://test'))
        .to.emit(this.badge, "Mint")
        .withArgs(this.test2.address, 0, 5, true);
        
        await expect(this.badge.connect(this.test2).mintPrevious(onBoardTime2, proof2, 'https://test', 4))
        .to.emit(this.badge, "Mint")
        .withArgs(this.test2.address, 1, 4, false);
      });

      it("Should return the ICanMint info", async function () {
        const { timestamps, leaves, tree } = getTree();

        const proof2 = getProof(tree, leaves[2]);
        await this.badge.setMerkleRoot(tree.getHexRoot());
        //2010-10-10
        const onBoardTime2 = timestamps[2].getTime() / 1000;

        await this.badge.setStartTime((new Date('2010-1-1')).getTime() / 1000);
        
        await expect(this.badge.connect(this.test2).mint(onBoardTime2, proof2, 'https://test'))
        .to.emit(this.badge, "Mint")
        .withArgs(this.test2.address, 0, 5, true);
        expect(await this.badge.connect(this.test2).ICanMint())
        .to.be.equal([0,1,2,3,4]);
        
      });
      */
      
    });

  });
  

  
});
