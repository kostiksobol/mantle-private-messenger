// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/MainConnector.sol";
import "../contracts/UserContract.sol";

contract MessengerContractsTest {
    function testRegisterUser() public {
        MainConnector connector = new MainConnector();

        connector.register(
            "alice",
            "Alice",
            "rsa-public-key",
            MainConnector.AccountKind.Human,
            ""
        );

        MainConnector.User memory user = connector.getUserByLogin("alice");

        require(user.userAddress == address(this), "Wrong user address");
        require(user.userContract != address(0), "User contract not created");
    }

    function testAddRecordAndGetLastRecords() public {
        MainConnector connector = new MainConnector();

        connector.addRecord("encrypted-invitation-1");
        connector.addRecord("encrypted-invitation-2");
        connector.addRecord("encrypted-invitation-3");

        string[] memory records = connector.getLastRecords(1);

        require(records.length == 2, "Wrong records length");
        require(
            keccak256(bytes(records[0])) == keccak256(bytes("encrypted-invitation-2")),
            "Wrong first record"
        );
        require(
            keccak256(bytes(records[1])) == keccak256(bytes("encrypted-invitation-3")),
            "Wrong second record"
        );
    }

    function testAddMessageAndGetLastMessages() public {
        MainConnector connector = new MainConnector();

        connector.register(
            "alice",
            "Alice",
            "rsa-public-key",
            MainConnector.AccountKind.Human,
            ""
        );

        MainConnector.User memory user = connector.getUserByLogin("alice");
        UserContract userContract = UserContract(user.userContract);

        userContract.addMessage("encrypted-message-1", "tag-1");
        userContract.addMessage("encrypted-message-2", "tag-2");
        userContract.addMessage("encrypted-message-3", "tag-3");

        UserContract.Message[] memory messages = userContract.getLastMessages(1);

        require(messages.length == 2, "Wrong messages length");
        require(
            keccak256(bytes(messages[0].encryptedContent)) ==
                keccak256(bytes("encrypted-message-2")),
            "Wrong first message"
        );
        require(
            keccak256(bytes(messages[1].tag)) == keccak256(bytes("tag-3")),
            "Wrong second tag"
        );
    }

    function testGetMessage() public {
        MainConnector connector = new MainConnector();

        connector.register(
            "alice",
            "Alice",
            "rsa-public-key",
            MainConnector.AccountKind.Human,
            ""
        );

        MainConnector.User memory user = connector.getUserByLogin("alice");
        UserContract userContract = UserContract(user.userContract);

        userContract.addMessage("encrypted-message-1", "tag-1");

        UserContract.Message memory message = userContract.getMessage(0);

        require(
            keccak256(bytes(message.encryptedContent)) ==
                keccak256(bytes("encrypted-message-1")),
            "Wrong message"
        );
        require(
            keccak256(bytes(message.tag)) == keccak256(bytes("tag-1")),
            "Wrong tag"
        );
    }
}
