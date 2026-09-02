# Tareas de desarrollo.
#
# No son una fuente de verdad nueva: cada receta es la misma orden que corre
# `.github/workflows/build.yml`, y la versión de Rust sigue saliendo sólo de
# `rust-toolchain.toml`. Lo que aporta el fichero es el **orden**, que leyendo
# la documentación no se ve: el wasm es una *entrada* del proyecto de Vite, así
# que `wasm-pack` va antes que nada de `web/`. Quien clona el repositorio y
# arranca `npm run dev` a secas se encuentra una página rota y ninguna pista.

WEB           := web
WASM          := $(WEB)/pkg/vektro_bg.wasm
NODE_MODULES  := $(WEB)/node_modules
RUST_SOURCES  := $(shell find src -name '*.rs') Cargo.toml Cargo.lock

.DEFAULT_GOAL := help

.PHONY: help install build test up

help:
	@echo "make install   toolchain, wasm-pack, corpus de tests y dependencias de la web"
	@echo "make build     wasm, CLI de release y sitio estático en $(WEB)/dist"
	@echo "make test      formato, clippy, tests, humo del wasm y lint de la web"
	@echo "make up        servidor de desarrollo en $(WEB)"

# Todo lo que hace falta para trabajar, en un clon recién hecho.
#
# `rustup show` no es informativo: al leer `rust-toolchain.toml` instala la
# versión y los targets que diga si no están. Y `scripts/corpus.sh` baja las
# tres imágenes de `tests/corpus.rs` —9 MB, no versionadas— o no hace nada si ya
# están y cuadran sus huellas, así que se puede llamar siempre.
install:
	rustup show active-toolchain
	command -v wasm-pack >/dev/null || cargo install wasm-pack --locked
	scripts/corpus.sh
	cd $(WEB) && npm ci

build: $(WASM)
	cargo build --release
	cd $(WEB) && npm run build

# El suite de debug, que es el que se corre a menudo. CI pasa además
# `cargo test --release`, porque release apaga los checks de desbordamiento;
# aquí saldría una compilación de release entera por cada vuelta.
test: $(WASM) $(NODE_MODULES)
	cargo fmt --check
	cargo clippy --all-targets -- -D warnings
	cargo test
	node scripts/web-smoke.mjs
	cd $(WEB) && npm run lint

up: $(WASM) $(NODE_MODULES)
	cd $(WEB) && npm run dev

# Las banderas van copiadas de `build.yml` tal cual: CI compara
# `web/pkg/vektro.d.ts` con lo que compila, y un paquete hecho aquí con otras
# banderas le haría fallar ese paso sin que nada hubiera cambiado de verdad.
$(WASM): $(RUST_SOURCES)
	wasm-pack build --release --target web \
	  --out-dir $(WEB)/pkg --out-name vektro \
	  -- --no-default-features --features wasm,illustration

# `npm ci` borra y rehace `node_modules`, así que su fecha queda más nueva que
# la del lockfile y make no vuelve a entrar hasta que el lockfile cambie.
$(NODE_MODULES): $(WEB)/package-lock.json $(WEB)/package.json
	cd $(WEB) && npm ci
	touch $@
