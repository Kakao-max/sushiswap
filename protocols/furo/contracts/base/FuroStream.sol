// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "../interfaces/IFuroStream.sol";


// Use the FuroStreamRouter to create Streams and do not create streams directly.

contract FuroStream is
    IFuroStream,
    ERC721("Furo Stream", "FUROSTREAM"),
    Multicall,
    BoringOwnable
{
    IBentoBoxMinimal public immutable bentoBox;
    address public immutable wETH;

    uint256 public streamIds;

    address public tokenURIFetcher;

    mapping(uint256 => Stream) public streams;

    // custom errors
    error NotSenderOrRecipient();
    error InvalidStartTime();
    error InvalidEndTime();
    error InvalidWithdrawTooMuch();
    error NotSender();
    error Overflow();

    constructor(IBentoBoxMinimal _bentoBox, address _wETH) {
        bentoBox = _bentoBox;
        wETH = _wETH;
        streamIds = 1000;
        _bentoBox.registerProtocol();
    }

    function setTokenURIFetcher(address _fetcher) external onlyOwner {
        tokenURIFetcher = _fetcher;
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        return ITokenURIFetcher(tokenURIFetcher).fetchTokenURIData(id);
    }

    function setBentoBoxApproval(
        address user,
        bool approved,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable override {
        bentoBox.setMasterContractApproval(
            user,
            address(this),
            approved,
            v,
            r,
            s
        );
    }


















}
