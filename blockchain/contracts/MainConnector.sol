// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./UserContract.sol";

contract MainConnector {
    enum AccountKind {
        Human,
        Agent
    }

    struct Account {
        address accountAddress;
        string login;
        string name;
        string pubkey;
        address userContract;
        AccountKind kind;
        string metadataURI;
        bool exists;
    }

    struct Record {
        string record;
        uint256 index;
    }

    mapping(address => Account) private accountsByAddress;
    mapping(bytes32 => address) private loginToAddress;
    mapping(address => bool) private registeredUserContracts;

    Record[] private records;

    event AccountRegistered(
        address indexed accountAddress,
        address indexed userContract,
        string login,
        AccountKind kind
    );

    event RecordAdded(uint256 recordIndex);

    modifier onlyRegisteredUserContract() {
        require(
            registeredUserContracts[msg.sender],
            "Only registered user contract"
        );
        _;
    }

    function register(
        string calldata login,
        string calldata name,
        string calldata pubkey,
        AccountKind kind,
        string calldata metadataURI
    ) external {
        require(!accountsByAddress[msg.sender].exists, "Already registered");
        require(bytes(login).length > 0, "Empty login");

        bytes32 loginHash = keccak256(bytes(login));
        require(loginToAddress[loginHash] == address(0), "Login already used");

        UserContract userContract = new UserContract(
            msg.sender,
            address(this)
        );

        Account memory account = Account({
            accountAddress: msg.sender,
            login: login,
            name: name,
            pubkey: pubkey,
            userContract: address(userContract),
            kind: kind,
            metadataURI: metadataURI,
            exists: true
        });

        accountsByAddress[msg.sender] = account;
        loginToAddress[loginHash] = msg.sender;
        registeredUserContracts[address(userContract)] = true;

        emit AccountRegistered(
            msg.sender,
            address(userContract),
            login,
            kind
        );
    }

    function addRecord(
        string calldata record,
        uint256 index
    ) external onlyRegisteredUserContract {
        records.push(
            Record({
                record: record,
                index: index
            })
        );

        emit RecordAdded(records.length - 1);
    }

    function getLastRecords(
        uint256 from
    ) external view returns (Record[] memory) {
        if (from >= records.length) {
            return new Record[](0);
        }

        uint256 resultLength = records.length - from;
        Record[] memory result = new Record[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = records[from + i];
        }

        return result;
    }

    function getUserByAddress(
        address accountAddress
    ) external view returns (Account memory) {
        require(
            accountsByAddress[accountAddress].exists,
            "Account not found"
        );

        return accountsByAddress[accountAddress];
    }

    function getUserByLogin(
        string calldata login
    ) external view returns (Account memory) {
        bytes32 loginHash = keccak256(bytes(login));
        address accountAddress = loginToAddress[loginHash];

        require(accountAddress != address(0), "Account not found");

        return accountsByAddress[accountAddress];
    }

    function isRegisteredUserContract(
        address userContract
    ) external view returns (bool) {
        return registeredUserContracts[userContract];
    }
}
