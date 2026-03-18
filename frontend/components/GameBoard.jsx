'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../utils/contract';

export default function GameBoard() {
  const { address, isConnected } = useAccount();
  const { writeContract } = useWriteContract();
  
  const [playerBoard, setPlayerBoard] = useState(Array(81).fill(0));
  const [isInitialized, setIsInitialized] = useState(false);
  const [submitTxHash, setSubmitTxHash] = useState(null);
  
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [betAmount, setBetAmount] = useState("5");

  // --- BLOCKCHAIN READS ---
  const { data: boardData, refetch: refetchBoard } = useReadContract({
    address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'getMyBoard', account: address,
  });

  const { data: ownerAddress } = useReadContract({
    address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'owner',
  });

  const { data: userWins, refetch: refetchWins } = useReadContract({
    address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'totalWins', args: [address],
  });

  // --- TRANSACTION WATCHER ---
  const { data: txReceipt, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: submitTxHash });

  // Decode events on confirmation
  useEffect(() => {
    if (isTxConfirmed && txReceipt) {
      let won = false;
      let lost = false;

      for (const log of txReceipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: CONTRACT_ABI, data: log.data, topics: log.topics });
          if (decoded.eventName === 'GameWon') won = true;
          if (decoded.eventName === 'GameLost') lost = true;
        } catch (e) { /* Ignore */ }
      }

      if (won) alert("🎉 YOU WON! Solution verified by Rust. Payout sent to your wallet!");
      else if (lost) alert("❌ INCORRECT! Your solution failed validation. Game over.");
      
      setSubmitTxHash(null);
      setIsInitialized(false);
      refetchWins();
      refetchBoard().then(() => setIsBoardLoading(false));
    }
  }, [isTxConfirmed, txReceipt, refetchBoard, refetchWins]);

  // --- FIX: HANDLE WALLET SWITCHING ---
  // If the user changes MetaMask accounts, immediately reset the board states
  useEffect(() => {
    setIsInitialized(false);
    setPlayerBoard(Array(81).fill(0));
  }, [address]);

  // Safely parse the Web3 array into JS state
  useEffect(() => {
    if (boardData && !isInitialized && !isBoardLoading) {
      const parsedData = boardData.map(val => Number(val));
      setPlayerBoard(parsedData);
      setIsInitialized(true);
    }
  }, [boardData, isInitialized, isBoardLoading]);

  // --- INPUT HANDLER ---
  const handleInput = (index, value) => {
    const newBoard = [...playerBoard];
    if (value === '') {
      newBoard[index] = 0;
      setPlayerBoard(newBoard);
      return;
    }
    const lastChar = value.slice(-1);
    const num = parseInt(lastChar, 10); 
    if (!isNaN(num) && num >= 1 && num <= 9) {
      newBoard[index] = num;
      setPlayerBoard(newBoard);
    }
  };

  // --- CONTRACT WRITES ---
  const handleStartFreeGame = () => {
    setLoadingMessage("Generating New Board...");
    setIsBoardLoading(true);
    setPlayerBoard(Array(81).fill(0));

    writeContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'startFreeGame' }, 
    { 
      onSuccess: async () => { setTimeout(() => { setIsInitialized(false); refetchBoard().then(() => setIsBoardLoading(false)); }, 2500); },
      onError: () => setIsBoardLoading(false)
    });
  };

  const handleStartHardGame = () => {
    if (Number(betAmount) < 5) return alert("Minimum bet is 5 PAS!");
    
    setLoadingMessage("Staking PAS & Generating Board...");
    setIsBoardLoading(true);
    setPlayerBoard(Array(81).fill(0));

    writeContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'startHardGame', value: parseEther(betAmount.toString()) }, 
    { 
      onSuccess: async () => { setTimeout(() => { setIsInitialized(false); refetchBoard().then(() => setIsBoardLoading(false)); }, 2500); },
      onError: () => setIsBoardLoading(false)
    });
  };

  const handleSubmit = () => {
    setLoadingMessage("Grading Paper on PolkaVM...");
    setIsBoardLoading(true);
    
    writeContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'submitSolution', args: [playerBoard] }, 
    { onSuccess: (hash) => setSubmitTxHash(hash), onError: () => setIsBoardLoading(false) });
  };

  const handleWithdraw = () => {
    writeContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'withdrawProfits', args: [parseEther('10')] },
    { onSuccess: () => alert("Profits successfully withdrawn!") });
  };

  const handleRefresh = () => {
    setLoadingMessage("Syncing with Blockchain...");
    setIsBoardLoading(true);
    setIsInitialized(false);
    refetchBoard().then(() => setIsBoardLoading(false));
  };

  if (!isConnected) {
    return <p className="mt-10 text-zinc-500 text-xl font-bold tracking-wide">Connect your wallet to play.</p>;
  }

  const isBoardEmpty = playerBoard.every(num => num === 0);

  return (
    <div className="flex flex-col items-center mt-10 w-full px-4 text-zinc-900 font-sans">
      
      {/* User Stats */}
      <div className="mb-8 bg-white px-6 py-2 rounded-full border border-zinc-200 shadow-sm flex items-center gap-2">
        <span className="text-zinc-500 uppercase tracking-widest text-sm font-bold">Total Wins:</span>
        <span className="text-zinc-900 font-black text-lg">{userWins ? userWins.toString() : '0'}</span>
      </div>

      {/* Game Controls */}
      <div className="flex flex-col sm:flex-row flex-wrap justify-center items-center gap-4 mb-8">
        <button onClick={handleStartFreeGame} className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg font-bold shadow-md transition-all uppercase tracking-wide text-sm">
          Start Free Game
        </button>

        <div className="flex items-center bg-white border-2 border-zinc-900 rounded-lg overflow-hidden shadow-md focus-within:ring-2 focus-within:ring-zinc-400 transition-all">
          <input 
            type="number" min="5" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} 
            className="w-16 px-3 py-3 text-center outline-none font-black text-zinc-900 bg-zinc-100"
          />
          <span className="text-zinc-500 font-bold px-3 text-sm">PAS</span>
          <button onClick={handleStartHardGame} className="px-6 py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold transition-all uppercase tracking-wide text-sm border-l-2 border-zinc-900">
            Hard Mode
          </button>
        </div>

        <button onClick={handleRefresh} className="px-6 py-3 bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-700 rounded-lg font-bold transition-all uppercase tracking-wide text-sm shadow-sm">
          Refresh Sync
        </button>
      </div>

      {/* The Grid / Loading State */}
      <div className="flex flex-col items-center w-full max-w-lg relative">
        
        {isBoardLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-50/90 backdrop-blur-sm rounded-xl border-2 border-zinc-200">
            <div className="w-10 h-10 border-4 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mb-4"></div>
            <p className="text-zinc-900 font-bold tracking-widest uppercase text-sm animate-pulse">{loadingMessage}</p>
          </div>
        )}

        <div className="bg-white p-3 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] mb-8 border border-zinc-200 w-full relative">
          <div className="grid grid-cols-9 gap-[1px] bg-zinc-900 border-4 border-zinc-900 w-full">
            {playerBoard.map((num, index) => {
              const borderRight = (index + 1) % 3 === 0 && (index + 1) % 9 !== 0 ? 'border-r-4 border-zinc-900' : '';
              const borderBottom = (index >= 18 && index <= 26) || (index >= 45 && index <= 53) ? 'border-b-4 border-zinc-900' : '';
              
              const isFixed = !isBoardLoading && boardData && Number(boardData[index]) !== 0;

              return isFixed ? (
                // FIX: Now securely reads the number straight from the blockchain data, preventing '0's
                <div key={`fixed-${index}`} className={`w-full aspect-square flex items-center justify-center bg-zinc-200 text-zinc-900 text-xl sm:text-2xl font-black ${borderRight} ${borderBottom}`}>
                  {Number(boardData[index])}
                </div>
              ) : (
                <input
                  key={`input-${index}`}
                  type="number" min="1" max="9"
                  value={num === 0 ? '' : num}
                  onChange={(e) => handleInput(index, e.target.value)}
                  disabled={isBoardLoading}
                  onKeyDown={(e) => {
                    if (!['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
                  }}
                  className={`w-full aspect-square text-center bg-white text-zinc-600 text-xl sm:text-2xl font-bold focus:bg-zinc-50 focus:outline-none focus:ring-inset focus:ring-4 focus:ring-zinc-400 focus:z-10 relative [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] transition-colors ${borderRight} ${borderBottom}`}
                />
              );
            })}
          </div>
        </div>

        {!isBoardEmpty && !isBoardLoading && (
          <button onClick={handleSubmit} className="px-12 py-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-black tracking-widest uppercase text-lg shadow-[0_10px_20px_rgba(0,0,0,0.15)] transition-all transform hover:-translate-y-1">
            Submit Solution
          </button>
        )}
      </div>

      {/* Admin Panel */}
      {ownerAddress && address && ownerAddress.toLowerCase() === address.toLowerCase() && (
        <div className="mt-16 p-6 border border-dashed border-zinc-300 rounded-xl bg-white text-center w-full max-w-sm shadow-sm">
          <h2 className="text-zinc-500 tracking-widest uppercase text-xs font-bold mb-4">Admin Controls</h2>
          <button onClick={handleWithdraw} className="w-full px-6 py-2 bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 text-zinc-800 rounded-lg font-bold text-sm transition-all shadow-sm">
            Withdraw Treasury
          </button>
        </div>
      )}
    </div>
  );
}