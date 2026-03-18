TARGETS = all clean
.PHONY: $(TARGETS)

all:
	cargo +nightly build \
		-Zjson-target-spec \
		-Zbuild-std=core \
		-Zbuild-std-features=compiler-builtins-mem \
		--target riscv64emac-unknown-none-polkavm.json \
		--release

	polkatool link --strip --output contract.polkavm target/riscv64emac-unknown-none-polkavm/release/contract

clean:
	cargo clean