import { ConnectButton } from '@rainbow-me/rainbowkit';
import GameBoard from '../components/GameBoard';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-6 sm:p-10 bg-zinc-50 text-zinc-900 selection:bg-zinc-300 font-sans">
      
      {/* Top Navigation */}
      <div className="w-full flex justify-end mb-8">
        <ConnectButton />
      </div>
      
      {/* Premium Title Section */}
      <div className="flex flex-col items-center mt-8 mb-4 text-center">
        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter text-zinc-900 uppercase drop-shadow-sm">
          SudoStake
        </h1>
        
        {/* Sleek Newspaper Divider */}
        <div className="w-32 h-1 bg-zinc-900 my-6"></div>
        
        <p className="text-zinc-500 font-bold tracking-widest uppercase text-xs sm:text-sm">
          On-Chain Procedural Sudoku on PolkaVM
        </p>
      </div>

      {/* Render the grid here! */}
      <div className="w-full flex justify-center">
        <GameBoard /> 
      </div>
      
    </main>
  );
}