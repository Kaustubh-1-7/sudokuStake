// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Interface pointing to your compiled Rust (.polkavm) file
interface IRustEngine {
    function generateSudoku(uint256 seed, uint8 difficulty) external view returns (uint8[81] memory);
    function verifySudoku(uint8[81] calldata startingBoard, uint8[81] calldata playerBoard) external view returns (bool);
}

contract SudoStake {
    address payable public owner;
    IRustEngine public rustEngine;

    // 5 PAS (Assuming 18 decimals for the native token)
    uint256 public constant MIN_BET = 5 ether; 

    struct GameSession {
        uint8[81] startingBoard;
        uint256 betAmount;
        uint8 difficulty; // 0 = Free, 1 = Hard
        bool isActive;
    }

    mapping(address => GameSession) public activeGames;
    mapping(address => uint256) public totalWins;

    event GameStarted(address indexed player, uint8 difficulty, uint256 betAmount);
    event GameWon(address indexed player, uint256 payout);
    event GameLost(address indexed player, uint256 slashedAmount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this!");
        _;
    }

    constructor(address _rustEngineAddress) {
        // Sets your deploying address as the boss
        owner = payable(msg.sender); 
        rustEngine = IRustEngine(_rustEngineAddress);
    }

    /// @notice Allows you (the owner) to fund the contract so it can pay out the 50% profits to winners
    receive() external payable {}

    /// @notice Starts a Free Game
    function startFreeGame() external {
        require(!activeGames[msg.sender].isActive, "Finish your current game first!");

        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
        uint8[81] memory newBoard = rustEngine.generateSudoku(seed, 0);

        activeGames[msg.sender] = GameSession({
            startingBoard: newBoard,
            betAmount: 0,
            difficulty: 0,
            isActive: true
        });

        emit GameStarted(msg.sender, 0, 0);
    }

    /// @notice Starts a Hard Game using native PAS
    function startHardGame() external payable {
        require(!activeGames[msg.sender].isActive, "Finish your current game first!");
        require(msg.value >= MIN_BET, "Must bet at least 5 PAS!");

        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender)));
        uint8[81] memory newBoard = rustEngine.generateSudoku(seed, 1);

        activeGames[msg.sender] = GameSession({
            startingBoard: newBoard,
            betAmount: msg.value, // Logs the exact amount of PAS they sent
            difficulty: 1,
            isActive: true
        });

        emit GameStarted(msg.sender, 1, msg.value);
    }

    /// @notice Submits the solved board
    function submitSolution(uint8[81] calldata playerBoard) external {
        GameSession memory session = activeGames[msg.sender];
        require(session.isActive, "No active game found!");

        // 1. Lock the session immediately (Reentrancy protection)
        activeGames[msg.sender].isActive = false;

        // 2. Ask Rust to grade the paper
        bool isValid = rustEngine.verifySudoku(session.startingBoard, playerBoard);

        if (isValid) {
            totalWins[msg.sender] += 1;

            if (session.difficulty == 1 && session.betAmount > 0) {
                // Calculate Reward: Original Bet + 50% Profit
                uint256 profit = session.betAmount / 2;
                uint256 totalPayout = session.betAmount + profit;

                require(address(this).balance >= totalPayout, "Treasury empty! Tell Admin to fund it.");
                
                // Send native PAS back to the winner
                (bool success, ) = payable(msg.sender).call{value: totalPayout}("");
                require(success, "Payout failed");

                emit GameWon(msg.sender, totalPayout);
            } else {
                emit GameWon(msg.sender, 0);
            }
        } else {
            // Player lost or cheated. The native PAS automatically stays inside this contract!
            emit GameLost(msg.sender, session.betAmount);
        }
    }

    /// @notice Helper for the frontend to fetch the current board to render
    function getMyBoard() external view returns (uint8[81] memory) {
        require(activeGames[msg.sender].isActive, "No active game");
        return activeGames[msg.sender].startingBoard;
    }

    /// @notice Admin function so you can withdraw the accumulated loser penalties
    function withdrawProfits(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance in treasury");
        (bool success, ) = owner.call{value: amount}("");
        require(success, "Withdraw failed");
    }
}