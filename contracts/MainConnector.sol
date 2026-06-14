// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./UserContract.sol";

contract MainConnector {
    enum AccountKind {
        Human,
        Agent
    }

    struct User {
        address userAddress;
        string login;
        string name;
        string pubkey;
        address userContract;
        AccountKind kind;
        string metadataURI;
    }

    event RecordAdded(uint256 indexed index, string record);

    User[] private users;

    mapping(address => uint256) private addressToUserIndex;
    mapping(bytes32 => uint256) private loginToUserIndex;

    string[] private records;

    function register(
        string calldata login,
        string calldata name,
        string calldata pubkey,
        AccountKind kind,
        string calldata metadataURI
    ) external {
        require(addressToUserIndex[msg.sender] == 0, "Already registered");
        require(bytes(login).length > 0, "Empty login");

        bytes32 loginHash = keccak256(bytes(login));
        require(loginToUserIndex[loginHash] == 0, "Login is taken");

        UserContract userContract = new UserContract(msg.sender);

        users.push(
            User({
                userAddress: msg.sender,
                login: login,
                name: name,
                pubkey: pubkey,
                userContract: address(userContract),
                kind: kind,
                metadataURI: metadataURI
            })
        );

        uint256 indexPlusOne = users.length;

        addressToUserIndex[msg.sender] = indexPlusOne;
        loginToUserIndex[loginHash] = indexPlusOne;
    }

    function addRecord(string calldata record) external {
        uint256 index = records.length;
        records.push(record);
        emit RecordAdded(index, record);
    }

    function getLastRecords(
        uint256 from
    ) external view returns (string[] memory) {
        if (from >= records.length) {
            return new string[](0);
        }

        uint256 resultLength = records.length - from;
        string[] memory result = new string[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = records[from + i];
        }

        return result;
    }

    function getUserByAddress(
        address userAddress
    ) external view returns (User memory) {
        uint256 indexPlusOne = addressToUserIndex[userAddress];

        if (indexPlusOne == 0) {
            return emptyUser();
        }

        return users[indexPlusOne - 1];
    }

    function getUserByLogin(
        string calldata login
    ) external view returns (User memory) {
        bytes32 loginHash = keccak256(bytes(login));
        uint256 indexPlusOne = loginToUserIndex[loginHash];

        if (indexPlusOne == 0) {
            return emptyUser();
        }

        return users[indexPlusOne - 1];
    }

    function emptyUser() private pure returns (User memory) {
        return User({
            userAddress: address(0),
            login: "",
            name: "",
            pubkey: "",
            userContract: address(0),
            kind: AccountKind.Human,
            metadataURI: ""
        });
    }
}
