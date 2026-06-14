// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract UserContract {
    struct Message {
        string encryptedContent;
        string tag;
        uint256 timestamp;
    }

    event MessageAdded(uint256 indexed index, string tag);

    address public owner;

    Message[] private messages;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address owner_) {
        owner = owner_;
    }

    function addMessage(
        string calldata encryptedContent,
        string calldata tag
    ) external onlyOwner {
        uint256 index = messages.length;

        messages.push(
            Message({
                encryptedContent: encryptedContent,
                tag: tag,
                timestamp: block.timestamp
            })
        );

        emit MessageAdded(index, tag);
    }

    function getLastMessages(
        uint256 from
    ) external view returns (Message[] memory) {
        if (from >= messages.length) {
            return new Message[](0);
        }

        uint256 resultLength = messages.length - from;
        Message[] memory result = new Message[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = messages[from + i];
        }

        return result;
    }

    function getMessage(
        uint256 index
    ) external view returns (Message memory) {
        if (index >= messages.length) {
            return Message({
                encryptedContent: "",
                tag: "",
                timestamp: 0
            });
        }

        return messages[index];
    }
}
