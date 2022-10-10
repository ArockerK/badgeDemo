// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/*

几点说明：
1. 通过链下生成merkle tree，然后再生成每个叶子的proof；叶子是address + onboardingTime
   员工在mint时，通过address找到自己对应的proof 和 onboardingTime，传入mint方法进行mint
   需要平台能通过address 获取 proof 和 onboardingTime

2. level的获取
    * 0 - less than 1 year
    * 1 - [1, 2) years
    * 2 - [2, 3) years
    * 3 - [3, 4] years
    * 4 - [4, 5) years
    * 5 - [5, ....) years
3. 有一个限制：startTime，这个是可以mint的最早时间

    举个例子：
    比如，约定 2022.10.1 开始mint；如果一个员工是2019.11.1入职（onboardingTime），那么，这个员工应该落在[2,3)年的区间，
    那么，他只能mint level == 2的（level从0开始），
    如果他想mint之前的（level 0 和 level 1），这是不允许的，因为 onboardingTime + getTimeFromLevel  < startTime
    
    再比如如果一个员工一直没有mint，等了两年或者更久再去mint，这样他是可以mint 两年前的level，也是通过startTime做的判断
    通过 mintPrevious 来进行
*/


import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";


contract Badge is ERC721, ERC721Enumerable, ERC721URIStorage, Pausable, ReentrancyGuard, Ownable {

    using Counters for Counters.Counter;
    Counters.Counter private _tokenId;
    
    // Current merkle root
    bytes32 public merkleRoot;
    // the time user can start to mint from
    uint256 public startTime;

    //store mint datas
    struct mintData {
        uint onboardingTime;
        //0, 1, 2 ...
        uint8[] minted;
    }
    mapping(address => mintData) public mintInfos;

    event Mint(address indexed user, uint256 indexed newTokenId, uint256 level, bool isCurrent);

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        startTime = block.timestamp;
    }

    /**
     * @notice Pause mint
     */
    function pauseMint() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause mint
     */
    function unpauseMint() external onlyOwner {
        _unpause();
    }
    
    /*
    function setStartTime(uint newTime) external onlyOwner {
        startTime = newTime;
    }
    */


    function setMerkleRoot(bytes32 newRoot) external onlyOwner {
        require(merkleRoot != newRoot, "SetMerkle: the same root");
        merkleRoot = newRoot;
    }

    function isMinted(uint8 level) public view returns (bool) {
        require(level <= 5, "isMinted: Too large level");
        mintData memory md = mintInfos[msg.sender];

        if (md.minted.length == 0) {
            return false;
        }

        for (uint256 i = 0; i < md.minted.length; i++) {
            if (md.minted[i] == level) {
                return true;
            }
        }

        return false;
    }

    /**
     * @notice Check whether it is possible to mint the level
     * @param user address of the user
     * @param onboardingTime onboarding time
     * @param merkleProof array with the merkle proof
     */
    function _verifyProof(
        address user,
        uint onboardingTime,
        bytes32[] calldata merkleProof
    ) internal view returns (bool) {
        // Compute the node and verify the merkle proof
        bytes32 node = keccak256(abi.encodePacked(user, onboardingTime));
        bool canUserMint = MerkleProof.verify(merkleProof, merkleRoot, node);
        return canUserMint;
    }

    /*
    * return level : level = [0,1,2,3,4,5]
    * 0 - less than 1 year
    * 1 - [1, 2) years
    * 2 - [2, 3) years
    * 3 - [3, 4] years
    * 4 - [4, 5) years
    * 5 - [5, ....) years
    */
    function getLevel(uint start, uint end) internal pure returns (uint8) {
        //uint interval = block.timestamp - onboardingTime;
        require(start <= end, "startTime must be early than endTime");
        uint interval = end - start;
        uint8 level = 0;
        if (interval < 365 days) {
            level = 0; 
        } else if (interval >= 365 days && interval < 2 * 365 days) {
            level = 1;
        } else if (interval >= 2 * 365 days && interval < 3 * 365 days) {
            level = 2;
        } else if (interval >= 3 * 365 days && interval < 4 * 365 days) {
            level = 3;
        } else if (interval >= 4 * 365 days && interval < 5 * 365 days) {
            level = 4;
        } else {
            level = 5;
        }
        return level;
    }

    /*
    * get the time from level and onboardingTime
    */
    function getTimeFromLevel(uint onboardingTime, uint8 level) internal pure returns (uint) {
        return onboardingTime + level * 1 * 365 days;
    }

    /**
     * @notice mint nft
     * @param onboardingTime onboardingTime of the sender
     * @param merkleProof array containing the merkle proof
     */
    
    function mint(uint onboardingTime, bytes32[] calldata merkleProof, string memory tokenUrl) external whenNotPaused nonReentrant returns (uint) {
        require(onboardingTime < block.timestamp, "Mint: invalid onboarding time");
        require(bytes(tokenUrl).length > 0, "Mint: The tokenUrl must not be null");
        //check if has mint this level
        uint8 level = getLevel(onboardingTime, block.timestamp);
        require(!isMinted(level), "Mint: This level has already minted");
        //check the proof
        require(_verifyProof(msg.sender, onboardingTime, merkleProof), "Mint: proof verified fail");

        //set once
        if (mintInfos[msg.sender].onboardingTime == 0) {
            mintInfos[msg.sender].onboardingTime = onboardingTime;
        }

        //mint nft
        uint tokenId = _tokenId.current();
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenUrl);
        _tokenId.increment();

        //set mintData
        mintInfos[msg.sender].minted.push(level);

        emit Mint(msg.sender, tokenId, level, true);
        return tokenId;
    }

    /**
     * @notice mint previous nft
     * @param onboardingTime onboardingTime of the sender
     * @param merkleProof array containing the merkle proof
     * @param level the level to be mint, from 0 to 5, see getLevel
     */
    function mintPrevious(uint onboardingTime, bytes32[] calldata merkleProof, string memory tokenUrl, uint8 level) external whenNotPaused nonReentrant returns (uint) {
        //check the proof
        require(level <= 5, "MintPrevious: Too large level");
        require(onboardingTime < block.timestamp, "MintPrevious: invalid onboarding time");
        require(bytes(tokenUrl).length > 0, "MintPrevious: The tokenUrl must not be null");
        require(_verifyProof(msg.sender, onboardingTime, merkleProof), "MintPrevious: proof verified fail");

        //set once
        if (mintInfos[msg.sender].onboardingTime == 0) {
            mintInfos[msg.sender].onboardingTime = onboardingTime;
        }

        //check the level
        uint mintTime = getTimeFromLevel(onboardingTime, level);
        require(mintTime > startTime, "MintPrevious: The mintTime is too early");

        //check if has mint this level
        require(!isMinted(level), "MintPrevious: This level has already minted");

        //mint nft
        uint tokenId = _tokenId.current();
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenUrl);
        _tokenId.increment();

        //set mintData
        mintInfos[msg.sender].minted.push(level);

        emit Mint(msg.sender, tokenId, level, false);
        return tokenId;
    }

    //增加一个查看可以mint的level 函数
    function ICanMint() external view returns (uint8[] memory canMint) {
        require(mintInfos[msg.sender].onboardingTime > 0, "Must call mint first");
        uint8 maxLevel = getLevel(mintInfos[msg.sender].onboardingTime, block.timestamp);
        uint8 minLevel = 0;
        uint j = 0;

        //如果入职时间 >= 部署时间，min = 0
        if (mintInfos[msg.sender].onboardingTime >= startTime) {
            minLevel = 0;
        } else {
            minLevel = getLevel(mintInfos[msg.sender].onboardingTime, startTime);
        }

        require(minLevel <= maxLevel, "Level error");

        for (uint8 i = minLevel; i <= maxLevel; i++) {
            if (!isMinted(i)) {
                j++;
            }
        }

        canMint = new uint8[](j);
        j = 0;
        for (uint8 i = minLevel; i <= maxLevel; i++) {
            if (!isMinted(i)) {
                canMint[j++] = i;
            }
        }
        return canMint;
    }


    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        whenNotPaused
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    // The following functions are overrides required by Solidity.

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
