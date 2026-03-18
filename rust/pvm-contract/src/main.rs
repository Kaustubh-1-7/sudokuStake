#![no_main]
#![no_std]

use uapi::{HostFn, HostFnImpl as api, ReturnFlags};

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    unsafe {
        core::arch::asm!("unimp");
        core::hint::unreachable_unchecked();
    }
}

const SELECTOR_VERIFY_SUDOKU: [u8; 4] = [0x38, 0xca, 0x7b, 0xb0];
const SELECTOR_GENERATE_SUDOKU: [u8; 4] = [0x6f, 0x66, 0x31, 0x62];

// --------------------------------------------------
// RNG
// --------------------------------------------------
struct Rng { state: u64 }

impl Rng {
    fn next_u32(&mut self) -> u32 {
        self.state = self.state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1);
        (self.state >> 33) as u32
    }

    fn gen_range(&mut self, max: u32) -> u32 {
        if max == 0 { return 0; }
        self.next_u32() % max
    }
}

// --------------------------------------------------
// SUDOKU GENERATION (NOW 100% ITERATIVE)
// --------------------------------------------------
fn is_safe(board: &[u8; 81], row: usize, col: usize, num: u8) -> bool {
    for x in 0..9 {
        if board[row * 9 + x] == num || board[x * 9 + col] == num { return false; }
    }
    let start_row = row - row % 3;
    let start_col = col - col % 3;
    for i in 0..3 {
        for j in 0..3 {
            if board[(i + start_row) * 9 + (j + start_col)] == num { return false; }
        }
    }
    true
}

fn fill_board(board: &mut [u8; 81], rng: &mut Rng) -> bool {
    let mut empty_cells = [0usize; 81];
    let mut num_empty = 0;
    
    // Find all empty spots
    for i in 0..81 {
        if board[i] == 0 {
            empty_cells[num_empty] = i;
            num_empty += 1;
        }
    }

    // Pre-shuffle the choices for every single cell based on the seed
    let mut choices = [[0u8; 9]; 81];
    for i in 0..num_empty {
        let mut nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for k in 0..9 {
            let j = rng.gen_range(9) as usize;
            let temp = nums[k];
            nums[k] = nums[j];
            nums[j] = temp;
        }
        choices[i] = nums;
    }

    let mut cell_idx = 0;
    let mut guess_index = [0usize; 81];

    // The Iterative Backtracking Loop (No recursion = No crash)
    while cell_idx < num_empty {
        let board_idx = empty_cells[cell_idx];
        let row = board_idx / 9;
        let col = board_idx % 9;

        let mut found = false;
        let start_guess = guess_index[cell_idx];

        for i in start_guess..9 {
            let num = choices[cell_idx][i];
            if is_safe(board, row, col, num) {
                board[board_idx] = num;
                guess_index[cell_idx] = i + 1;
                found = true;
                break;
            }
        }

        if found {
            cell_idx += 1; // Move forward
        } else {
            // Backtrack
            board[board_idx] = 0;
            guess_index[cell_idx] = 0;
            if cell_idx == 0 { return false; } // Unsolvable
            cell_idx -= 1; 
        }
    }
    true
}

fn generate_sudoku(seed: u64, difficulty: u8) -> [u8; 81] {
    let mut rng = Rng { state: seed };
    let mut board = [0u8; 81];

    fill_board(&mut board, &mut rng);

    let remove = if difficulty == 1 { 55 } else { 40 };
    let mut removed = 0;
    while removed < remove {
        let idx = rng.gen_range(81) as usize;
        if board[idx] != 0 {
            board[idx] = 0;
            removed += 1;
        }
    }
    board
}

// --------------------------------------------------
// VALIDATION
// --------------------------------------------------
fn validate_sudoku(start: &[u8;81], solved: &[u8;81]) -> bool {
    for i in 0..81 {
        if solved[i] < 1 || solved[i] > 9 { return false; }
        if start[i] != 0 && start[i] != solved[i] { return false; }
    }

    for i in 0..9 {
        let mut row = 0u16;
        let mut col = 0u16;
        let mut blk = 0u16;

        for j in 0..9 {
            row |= 1 << solved[i*9 + j];
            col |= 1 << solved[j*9 + i];
            let r = (i/3)*3 + j/3;
            let c = (i%3)*3 + j%3;
            blk |= 1 << solved[r*9 + c];
        }
        if row != 1022 || col != 1022 || blk != 1022 { return false; }
    }
    true
}

// --------------------------------------------------
// GLOBAL MEMORY BUFFER
// --------------------------------------------------
static mut PVM_BUFFER: [u8; 5184] = [0; 5184];

// --------------------------------------------------
// ENTRY POINT
// --------------------------------------------------
#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn deploy() {}

#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn call() {
    let mut selector = [0u8;4];
    api::call_data_copy(&mut selector, 0);

    if selector == SELECTOR_GENERATE_SUDOKU {
        handle_generate();
    } else if selector == SELECTOR_VERIFY_SUDOKU {
        handle_verify();
    } else {
        api::return_value(ReturnFlags::REVERT, &[]);
    }
}

// --------------------------------------------------
// HANDLERS
// --------------------------------------------------
fn handle_generate() {
    let mut input = [0u8; 64];
    api::call_data_copy(&mut input, 4);

    let mut seed_bytes = [0u8;8];
    seed_bytes.copy_from_slice(&input[24..32]);

    let seed = u64::from_be_bytes(seed_bytes);
    let difficulty = input[63];

    let board = generate_sudoku(seed, difficulty);

    unsafe {
        for i in 0..2592 { PVM_BUFFER[i] = 0; }
        for i in 0..81 { PVM_BUFFER[i*32 + 31] = board[i]; }
        api::return_value(ReturnFlags::empty(), &PVM_BUFFER[0..2592]);
    }
}

fn handle_verify() {
    unsafe {
        api::call_data_copy(&mut PVM_BUFFER, 4);

        let mut start = [0u8;81];
        let mut solved = [0u8;81];

        for i in 0..81 {
            start[i]  = PVM_BUFFER[i*32 + 31];
            solved[i] = PVM_BUFFER[(81+i)*32 + 31];
        }

        let valid = validate_sudoku(&start, &solved);

        let mut out = [0u8;32];
        if valid { out[31] = 1; }
        api::return_value(ReturnFlags::empty(), &out);
    }
}