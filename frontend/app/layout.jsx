import './globals.css';
import { Providers } from '../components/Providers';

export const metadata = {
  title: 'SudoStake',
  description: 'On-Chain Procedural Sudoku on PolkaVM',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}