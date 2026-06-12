// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMainConnector {
    function addRecord(
        string calldata record,
        uint256 index
    ) external;
}

contract UserContract {
    struct Message {
        string encryptedContent;
        string tag;
        uint256 timestamp;
    }

    address public owner;
    address public mainConnector;

    Message[] private messages;

    event MessageAdded(uint256 messageIndex);
    event InvitationAdded(uint256 messageIndex);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(
        address owner_,
        address mainConnector_
    ) {
        require(owner_ != address(0), "Zero owner");
        require(mainConnector_ != address(0), "Zero main connector");

        owner = owner_;
        mainConnector = mainConnector_;
    }

    function addMessage(
        string calldata encryptedContent,
        string calldata tag
    ) external onlyOwner {
        messages.push(
            Message({
                encryptedContent: encryptedContent,
                tag: tag,
                timestamp: block.timestamp
            })
        );

        emit MessageAdded(messages.length - 1);
    }

    function addInvitation(
        string calldata encryptedContent,
        string calldata tag,
        string calldata record
    ) external onlyOwner {
        messages.push(
            Message({
                encryptedContent: encryptedContent,
                tag: tag,
                timestamp: block.timestamp
            })
        );

        uint256 messageIndex = messages.length - 1;

        IMainConnector(mainConnector).addRecord(record, messageIndex);

        emit InvitationAdded(messageIndex);
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
        require(index < messages.length, "Message not found");

        return messages[index];
    }
}
